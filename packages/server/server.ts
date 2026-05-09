import { EventEmitter } from "../core/event-emitter.js";
import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";
import type { Task, Resource, SubmitOptions } from "../core/task.js";
import { ServerTransport } from "./transport.js";
import { ConnectionManager } from "./connection-manager.js";
import type { ClientState } from "./connection-manager.js";

interface TaskState {
  task: Task;
  serialIndex: number;
  pendingClients: Set<string>;
}

export type ServerEvents = {
  "client:online": (client: ClientState) => void;
  "client:offline": (info: { id: string }) => void;
  "task:created": (task: Task) => void;
  "task:updated": (task: Task) => void;
  "task:completed": (task: Task) => void;
  "task:failed": (task: Task) => void;
  "message": (clientId: string, msg: Message) => void;
};

export interface ServerOptions {
  port: number;
  host?: string;
  heartbeatTimeout?: number;
  defaultTaskTimeout?: number;
}

export class Server extends EventEmitter<ServerEvents> {
  private transport: ServerTransport;
  private connectionManager: ConnectionManager;
  private tasks = new Map<string, TaskState>();
  private taskCounter = 0;

  constructor(private options: ServerOptions) {
    super();

    this.transport = new ServerTransport({
      port: options.port,
      host: options.host,
    });

    this.connectionManager = new ConnectionManager({
      heartbeatTimeout: options.heartbeatTimeout,
    });

    this.setupTransportHandlers();
    this.setupConnectionManagerHandlers();
  }

  async start(): Promise<void> {
    await this.transport.start();
    this.connectionManager.startTimeoutChecker();
  }

  async stop(): Promise<void> {
    this.connectionManager.stopTimeoutChecker();
    await this.transport.stop();
  }

  getClient(clientId: string): ClientState | undefined {
    return this.connectionManager.getClient(clientId);
  }

  getClients(): ClientState[] {
    return this.connectionManager.getAllClients();
  }

  getOnlineClients(): ClientState[] {
    return this.connectionManager.getOnlineClients();
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)?.task;
  }

  getAllTasks(): Task[] {
    return [...this.tasks.values()].map((ts) => ts.task);
  }

  notify(clientId: string, subtype: string, payload: unknown): void {
    const msg = createMessage("notify", "server", clientId, payload, { subtype });
    this.transport.send(clientId, msg);
  }

  private setupTransportHandlers(): void {
    this.transport.on("connection", (clientId: unknown) => {
      const id = clientId as string;
      this.connectionManager.addClient(id);
      const state = this.connectionManager.getClient(id)!;
      this.emit("client:online", state);
    });

    this.transport.on("close", (clientId: unknown) => {
      const id = clientId as string;
      this.connectionManager.removeClient(id);
      this.emit("client:offline", { id });
      this.failClientTasks(id);
    });

    this.transport.on("message", (clientId: unknown, msg: unknown) => {
      this.handleMessage(clientId as string, msg as Message);
    });
  }

  private setupConnectionManagerHandlers(): void {
    this.connectionManager.on("client:offline", (clientId: unknown) => {
      const id = clientId as string;
      this.emit("client:offline", { id });
      this.failClientTasks(id);
    });
  }

  private handleMessage(clientId: string, msg: Message): void {
    switch (msg.type) {
      case "heartbeat":
        this.handleHeartbeat(clientId, msg);
        break;
      case "submit":
        this.handleSubmit(clientId, msg);
        break;
      case "result":
        this.handleResult(clientId, msg);
        break;
      case "notify":
      case "message":
        if (msg.to !== "server") {
          this.transport.send(msg.to, msg);
        }
        this.emit("message", clientId, msg);
        break;
    }
  }

  private handleHeartbeat(clientId: string, msg: Message): void {
    this.connectionManager.updateHeartbeat(clientId, msg.payload as any);
    const ack = createMessage("heartbeat_ack", "server", clientId, {});
    this.transport.send(clientId, ack);
  }

  private handleSubmit(clientId: string, msg: Message): void {
    const payload = msg.payload as SubmitOptions;

    if (!payload.subscribe || payload.subscribe.length === 0) {
      const err = createMessage("error", "server", clientId, {
        message: "subscribe cannot be empty",
      });
      this.transport.send(clientId, err);
      return;
    }

    const taskId = `task-${Date.now()}-${++this.taskCounter}`;
    const task: Task = {
      id: taskId,
      createBy: clientId,
      subscribe: payload.subscribe,
      content: payload.content,
      mode: payload.mode,
      status: "pending",
      resources: [],
      createdAt: Date.now(),
    };

    const state: TaskState = {
      task,
      serialIndex: 0,
      pendingClients: new Set(payload.subscribe),
    };
    this.tasks.set(taskId, state);

    this.emit("task:created", task);
    this.notifyTaskUpdate(task);

    if (task.mode === "serial") {
      this.dispatchSerial(state);
    } else {
      this.dispatchParallel(state);
    }
  }

  private dispatchSerial(state: TaskState): void {
    const { task } = state;
    if (state.serialIndex >= task.subscribe.length) {
      this.completeTask(state);
      return;
    }

    const targetId = task.subscribe[state.serialIndex];
    if (!this.connectionManager.isOnline(targetId)) {
      task.status = "failed";
      this.addResource(task, "client-result", targetId, {
        error: `Client ${targetId} is offline`,
      });
      this.emit("task:failed", task);
      this.notifyTaskUpdate(task);
      return;
    }

    task.status = "running";
    this.notifyTaskUpdate(task);

    const dispatchMsg = createMessage("dispatch", "server", targetId, task);
    this.transport.send(targetId, dispatchMsg);
  }

  private dispatchParallel(state: TaskState): void {
    const { task } = state;
    task.status = "running";
    this.notifyTaskUpdate(task);

    for (const targetId of task.subscribe) {
      if (!this.connectionManager.isOnline(targetId)) {
        state.pendingClients.delete(targetId);
        this.addResource(task, "client-result", targetId, {
          error: `Client ${targetId} is offline`,
        });
        continue;
      }
      const dispatchMsg = createMessage("dispatch", "server", targetId, task);
      this.transport.send(targetId, dispatchMsg);
    }

    if (state.pendingClients.size === 0) {
      this.completeTask(state);
    }
  }

  private handleResult(clientId: string, msg: Message): void {
    const { taskId, success, data, error } = msg.payload as {
      taskId: string;
      success: boolean;
      data?: unknown;
      error?: string;
    };

    const state = this.tasks.get(taskId);
    if (!state) return;

    const { task } = state;

    if (!success) {
      this.addResource(task, "client-result", clientId, { error });
      task.status = "failed";
      this.emit("task:failed", task);
      this.notifyTaskUpdate(task);
      return;
    }

    this.addResource(task, "client-result", clientId, data);
    state.pendingClients.delete(clientId);

    if (task.mode === "serial") {
      state.serialIndex++;
      this.notifyTaskUpdate(task);
      this.dispatchSerial(state);
    } else {
      this.notifyTaskUpdate(task);
      if (state.pendingClients.size === 0) {
        this.completeTask(state);
      }
    }
  }

  private completeTask(state: TaskState): void {
    state.task.status = "completed";
    this.emit("task:completed", state.task);
    this.notifyTaskUpdate(state.task);
  }

  private addResource(task: Task, type: string, by: string, data: unknown): void {
    task.resources.push({ type, by, data });
  }

  private notifyTaskUpdate(task: Task): void {
    const targets = new Set<string>([task.createBy, ...task.subscribe]);
    for (const targetId of targets) {
      if (!this.connectionManager.isOnline(targetId)) continue;
      try {
        const msg = createMessage("task", "server", targetId, task);
        this.transport.send(targetId, msg);
      } catch {
        // client may have disconnected
      }
    }
    this.emit("task:updated", task);
  }

  private failClientTasks(clientId: string): void {
    for (const [, state] of this.tasks) {
      if (state.task.status !== "running" && state.task.status !== "pending") continue;
      if (!state.pendingClients.has(clientId) && state.task.createBy !== clientId) continue;

      if (state.pendingClients.has(clientId)) {
        this.addResource(state.task, "client-result", clientId, {
          error: `Client ${clientId} disconnected`,
        });
        state.pendingClients.delete(clientId);
      }

      if (state.task.mode === "serial" && state.pendingClients.size > 0) {
        // serial: try next client
        state.serialIndex++;
        this.dispatchSerial(state);
      } else if (state.pendingClients.size === 0) {
        state.task.status = "failed";
        this.emit("task:failed", state.task);
        this.notifyTaskUpdate(state.task);
      }
    }
  }
}
