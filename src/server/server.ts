import { EventEmitter } from "../core/event-emitter.js";
import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";
import type { TaskResult, TaskProgress } from "../core/task.js";
import type { CapabilityDefinition } from "../core/capability.js";
import { ServerTransport } from "./transport.js";
import { ConnectionManager } from "./connection-manager.js";
import type { ClientState } from "./connection-manager.js";
import { CapabilityRegistry } from "./capability-registry.js";
import { TaskDispatcher } from "./task-dispatcher.js";
import { MessageRouter } from "./message-router.js";

export type ServerEvents = {
  "client:online": (client: ClientState) => void;
  "client:offline": (info: { id: string }) => void;
  "client:registered": (clientId: string, caps: CapabilityDefinition[]) => void;
  "task:completed": (taskId: string, result: TaskResult) => void;
  "task:progress": (taskId: string, progress: TaskProgress) => void;
  "message": (clientId: string, msg: Message) => void;
}

export interface ServerOptions {
  port: number;
  host?: string;
  heartbeatTimeout?: number;
  defaultTaskTimeout?: number;
}

export class Server extends EventEmitter<ServerEvents> {
  private transport: ServerTransport;
  private connectionManager: ConnectionManager;
  private capabilityRegistry: CapabilityRegistry;
  private taskDispatcher: TaskDispatcher;
  private messageRouter: MessageRouter;

  // task tracking
  private pendingTasks = new Map<
    string,
    {
      resolve: (result: TaskResult) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      fromClient?: string; // for client-to-client routing
      originalRequestId?: string; // original request message id for replyTo
    }
  >();

  constructor(private options: ServerOptions) {
    super();

    this.transport = new ServerTransport({
      port: options.port,
      host: options.host,
    });

    this.connectionManager = new ConnectionManager({
      heartbeatTimeout: options.heartbeatTimeout,
    });

    this.capabilityRegistry = new CapabilityRegistry();

    this.taskDispatcher = new TaskDispatcher(
      this.connectionManager,
      this.capabilityRegistry,
      (clientId, msg) => this.transport.send(clientId, msg),
      { defaultTimeout: options.defaultTaskTimeout }
    );

    this.messageRouter = new MessageRouter(
      (clientId, msg) => this.transport.send(clientId, msg)
    );

    this.setupTransportHandlers();
    this.setupConnectionManagerHandlers();
  }

  async start(): Promise<void> {
    await this.transport.start();
    this.connectionManager.startTimeoutChecker();
  }

  async stop(): Promise<void> {
    this.connectionManager.stopTimeoutChecker();
    for (const [, pending] of this.pendingTasks) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server shutting down"));
    }
    this.pendingTasks.clear();
    this.messageRouter.cancelAll();
    await this.transport.stop();
  }

  // --- Public API ---

  getClient(clientId: string) {
    return this.connectionManager.getClient(clientId);
  }

  getClients() {
    return this.connectionManager.getAllClients();
  }

  getOnlineClients() {
    return this.connectionManager.getOnlineClients();
  }

  getClientCapabilities(clientId: string): CapabilityDefinition[] {
    return this.capabilityRegistry.getClientCapabilities(clientId);
  }

  async executeAny(
    taskName: string,
    params: Record<string, unknown>,
    options?: { priority?: number; mode?: "queue" | "preemptive"; timeout?: number }
  ): Promise<TaskResult> {
    const clientId = this.taskDispatcher.selectClient(taskName);
    if (!clientId) {
      throw new Error(`No available client for capability: ${taskName}`);
    }
    return this.executeTo(clientId, taskName, params, options);
  }

  async executeTo(
    clientId: string,
    taskName: string,
    params: Record<string, unknown>,
    options?: { priority?: number; mode?: "queue" | "preemptive"; timeout?: number }
  ): Promise<TaskResult> {
    const timeout = options?.timeout ?? this.options.defaultTaskTimeout ?? 60000;
    const taskId = this.taskDispatcher.dispatch(clientId, taskName, params, options);

    return new Promise<TaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
      }, timeout);

      this.pendingTasks.set(taskId, { resolve, reject, timer });
    });
  }

  notify(clientId: string, subtype: string, payload: unknown): void {
    const msg = createMessage("notify", "server", clientId, payload, { subtype });
    this.transport.send(clientId, msg);
  }

  // --- Internal handlers ---

  private setupTransportHandlers(): void {
    this.transport.on("connection", (clientId: unknown) => {
      const id = clientId as string;
      this.connectionManager.addClient(id);
      this.emit("client:online", this.connectionManager.getClient(id)!);
    });

    this.transport.on("close", (clientId: unknown) => {
      const id = clientId as string;
      this.capabilityRegistry.unregister(id);
      this.connectionManager.removeClient(id);
      this.emit("client:offline", { id });
    });

    this.transport.on("message", (clientId: unknown, msg: unknown) => {
      const id = clientId as string;
      const message = msg as Message;
      this.handleMessage(id, message);
    });
  }

  private setupConnectionManagerHandlers(): void {
    this.connectionManager.on("client:offline", (clientId: unknown) => {
      this.emit("client:offline", { id: clientId });
    });
  }

  private handleMessage(clientId: string, msg: Message): void {
    switch (msg.type) {
      case "register":
        this.handleRegister(clientId, msg);
        break;
      case "heartbeat":
        this.handleHeartbeat(clientId, msg);
        break;
      case "execute_result":
        this.handleExecuteResult(clientId, msg);
        break;
      case "execute_progress":
        this.handleExecuteProgress(clientId, msg);
        break;
      case "execute_request":
        this.handleExecuteRequest(clientId, msg);
        break;
      case "notify":
      case "message":
        this.emit("message", clientId, msg);
        break;
      default:
        break;
    }
  }

  private handleRegister(clientId: string, msg: Message): void {
    const caps = msg.payload as CapabilityDefinition[];
    for (const cap of caps) {
      this.capabilityRegistry.register(clientId, cap);
    }

    const ack = createMessage("register_ack", "server", clientId, { success: true });
    this.transport.send(clientId, ack);
    this.emit("client:registered", clientId, caps);
  }

  private handleHeartbeat(clientId: string, msg: Message): void {
    this.connectionManager.updateHeartbeat(clientId, msg.payload as any);
    const ack = createMessage("heartbeat_ack", "server", clientId, {});
    this.transport.send(clientId, ack);
  }

  private handleExecuteResult(_clientId: string, msg: Message): void {
    const taskId = msg.replyTo ?? (msg.payload as any).taskId;

    // check if this is a client-to-client result that needs forwarding
    const pending = this.pendingTasks.get(taskId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingTasks.delete(taskId);

    const result = msg.payload as TaskResult;

    // if fromClient is set, this was a client-to-client call, forward result
    if (pending.fromClient) {
      const forwardMsg = createMessage(
        "execute_result",
        "server",
        pending.fromClient,
        result,
        { replyTo: pending.originalRequestId ?? taskId }
      );
      this.transport.send(pending.fromClient, forwardMsg);
    } else {
      pending.resolve(result);
    }

    this.emit("task:completed", taskId, result);
  }

  private handleExecuteProgress(clientId: string, msg: Message): void {
    const progress = msg.payload as TaskProgress;
    this.emit("task:progress", progress.taskId, progress);
  }

  private handleExecuteRequest(clientId: string, msg: Message): void {
    const { taskName, params, timeout } = msg.payload as {
      taskName: string;
      params: Record<string, unknown>;
      timeout?: number;
    };

    const targetClientId = this.taskDispatcher.selectClient(taskName);
    if (!targetClientId) {
      const err = createMessage("error", "server", clientId, {
        message: `No available client for capability: ${taskName}`,
      });
      this.transport.send(clientId, err);
      return;
    }

    const effectiveTimeout = timeout ?? this.options.defaultTaskTimeout ?? 60000;
    const taskId = this.taskDispatcher.dispatch(targetClientId, taskName, params, {
      timeout: effectiveTimeout,
    });

    // track for forwarding result back
    this.messageRouter.trackRequest(taskId, clientId, effectiveTimeout, () => {
      this.pendingTasks.delete(taskId);
      if (!this.transport.isConnected(clientId)) return;
      const err = createMessage("error", "server", clientId, {
        message: `Task ${taskId} timed out`,
      });
      this.transport.send(clientId, err);
    });

    this.pendingTasks.set(taskId, {
      resolve: () => {}, // will be handled by handleExecuteResult via fromClient
      reject: () => {},
      timer: setTimeout(() => {}, effectiveTimeout), // placeholder
      fromClient: clientId,
      originalRequestId: msg.id,
    });
  }
}
