import { EventEmitter } from "../core/event-emitter.js";
import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";
import type { TaskResult, TaskProgress, TaskInstance } from "../core/task.js";
import { ClientTransport } from "./transport.js";
import { Heartbeat } from "./heartbeat.js";
import { TaskQueue } from "./task-queue.js";
import { TaskExecutor } from "./task-executor.js";
import { type CapabilityRegistration, toDefinition } from "./capability.js";

export type ClientEvents = {
  "connected": () => void;
  "disconnected": () => void;
  "reconnecting": (attempt: number) => void;
  "registered": () => void;
  "notify": (msg: Message) => void;
  "message": (msg: Message) => void;
  "error": (payload: unknown) => void;
};

export interface ClientOptions {
  id: string;
  servers: string[];
  heartbeatInterval?: number;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class Client extends EventEmitter<ClientEvents> {
  private transport: ClientTransport;
  private heartbeat: Heartbeat;
  private queue: TaskQueue;
  private executor: TaskExecutor;
  private capabilities = new Map<string, CapabilityRegistration>();
  private taskCounter = 0;

  // server-to-client task tracking
  private pendingResults = new Map<string, {
    resolve: (result: TaskResult) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(private options: ClientOptions) {
    super();

    this.transport = new ClientTransport({
      url: options.servers[0] + "?clientId=" + encodeURIComponent(options.id),
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval,
      maxReconnectAttempts: options.maxReconnectAttempts,
    });

    this.queue = new TaskQueue();
    this.heartbeat = new Heartbeat(
      options.id,
      (msg) => this.transport.send(msg),
      () => ({
        queueLength: this.queue.queueLength,
        running: this.queue.currentTask
          ? {
              taskId: this.queue.currentTask.id,
              taskName: this.queue.currentTask.name,
              progress: this.queue.currentTask.progress?.progress,
            }
          : undefined,
        uptime: 0, // will be overwritten by heartbeat
      }),
      options.heartbeatInterval ?? 10000
    );

    this.executor = new TaskExecutor(
      this.queue,
      this.capabilities,
      (taskId, result) => this.handleTaskResult(taskId, result),
      (taskId, progress) => this.handleTaskProgress(taskId, progress),
      (taskName, params) => this.executeOnServer(taskName, params),
    );

    this.setupTransport();
  }

  // --- Public API ---

  register(
    name: string,
    options: {
      description?: string;
      params?: Record<string, import("../core/capability.js").ParamDef>;
      mode?: "queue" | "preemptive";
      priority?: number;
      timeout?: number;
      maxRetries?: number;
      retryDelay?: number;
      execute: import("./capability.js").AsyncExecuteFn | import("./capability.js").GeneratorExecuteFn;
    }
  ): void {
    const reg: CapabilityRegistration = {
      name,
      description: options.description ?? name,
      params: options.params ?? {},
      mode: options.mode ?? "queue",
      priority: options.priority ?? 0,
      timeout: options.timeout,
      maxRetries: options.maxRetries,
      retryDelay: options.retryDelay,
      execute: options.execute,
    };
    this.capabilities.set(name, reg);
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    this.heartbeat.start();
  }

  disconnect(): void {
    this.heartbeat.stop();
    this.transport.disconnect();
  }

  async execute(taskName: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.executeOnServer(taskName, params);
  }

  send(subtype: string, payload: unknown): void {
    const msg = createMessage("message", this.options.id, "server", payload, { subtype });
    this.transport.send(msg);
  }

  // --- Internal ---

  private setupTransport(): void {
    this.transport.on("open", () => {
      this.sendRegister();
      this.emit("connected");
    });

    this.transport.on("message", (msg: unknown) => {
      this.handleMessage(msg as Message);
    });

    this.transport.on("close", () => {
      this.heartbeat.stop();
      this.emit("disconnected");
    });

    this.transport.on("reconnecting", (attempt: unknown) => {
      this.emit("reconnecting", attempt as number);
    });
  }

  private sendRegister(): void {
    const defs = [...this.capabilities.values()].map(toDefinition);
    const msg = createMessage("register", this.options.id, "server", defs);
    this.transport.send(msg);
  }

  private handleMessage(msg: Message): void {
    switch (msg.type) {
      case "register_ack":
        this.emit("registered");
        break;
      case "heartbeat_ack":
        break;
      case "execute":
        this.handleExecute(msg);
        break;
      case "execute_result":
        this.handleExecuteResult(msg);
        break;
      case "execute_abort":
        this.handleExecuteAbort(msg);
        break;
      case "notify":
        this.emit("notify:" + msg.subtype, msg.payload);
        this.emit("notify", msg);
        break;
      case "message":
        this.emit("message:" + msg.subtype, msg.payload);
        this.emit("message", msg);
        break;
      case "error":
        this.emit("error", msg.payload);
        break;
    }
  }

  private handleExecute(msg: Message): void {
    const payload = msg.payload as {
      taskId: string;
      name: string;
      params: Record<string, unknown>;
      mode: "queue" | "preemptive";
      priority: number;
      timeout?: number;
    };

    const cap = this.capabilities.get(payload.name);
    if (!cap) {
      const result: TaskResult = {
        success: false,
        error: `Unknown capability: ${payload.name}`,
        duration: 0,
      };
      const reply = createMessage("execute_result", this.options.id, "server", result, {
        replyTo: payload.taskId,
      });
      this.transport.send(reply);
      return;
    }

    const task: TaskInstance = {
      id: payload.taskId,
      name: payload.name,
      params: payload.params,
      mode: payload.mode,
      priority: payload.priority,
      status: "pending",
      timeout: payload.timeout,
      maxRetries: cap.maxRetries,
      retryDelay: cap.retryDelay,
      retryCount: 0,
      createdAt: Date.now(),
    };

    this.queue.enqueue(task);
    this.executor.processNext();
  }

  private handleTaskResult(taskId: string, result: TaskResult): void {
    const msg = createMessage("execute_result", this.options.id, "server", result, {
      replyTo: taskId,
    });
    try {
      this.transport.send(msg);
    } catch {
      // transport disconnected, result lost
    }
    // process next task in queue
    this.executor.processNext();
  }

  private handleTaskProgress(taskId: string, progress: TaskProgress): void {
    const msg = createMessage("execute_progress", this.options.id, "server", progress);
    try {
      this.transport.send(msg);
    } catch {
      // transport disconnected
    }
  }

  private handleExecuteResult(msg: Message): void {
    const replyTo = msg.replyTo;
    if (!replyTo) return;
    const pending = this.pendingResults.get(replyTo);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingResults.delete(replyTo);
    pending.resolve(msg.payload as TaskResult);
  }

  private handleExecuteAbort(msg: Message): void {
    const { taskId } = msg.payload as { taskId: string };
    this.executor.abort(taskId);
  }

  private async executeOnServer(taskName: string, params: Record<string, unknown>): Promise<unknown> {
    const requestId = `req-${Date.now()}-${++this.taskCounter}`;
    const msg = createMessage("execute_request", this.options.id, "server", {
      taskName,
      params,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResults.delete(requestId);
        reject(new Error(`Execute request ${requestId} timed out`));
      }, 60000);

      this.pendingResults.set(requestId, {
        resolve: (result) => {
          if (result.success) resolve(result.data);
          else reject(new Error(result.error));
        },
        reject,
        timer,
      });

      // use msg.id as the requestId for matching
      msg.id = requestId;
      this.transport.send(msg);
    });
  }
}
