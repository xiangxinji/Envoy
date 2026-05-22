import { EventEmitter } from "../core/event-emitter.js";
import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";
import type { Task, SubmitOptions } from "../core/task.js";
import { ClientTransport } from "./transport.js";
import { Heartbeat } from "./heartbeat.js";

export interface ClientTask {
  id: string;
  serverTask: Task;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export type TaskHandler = (clientTask: ClientTask) => Promise<unknown>;

export const SKIP_RESULT: unique symbol = Symbol("SKIP_RESULT");

export type ClientEvents = {
  "connected": () => void;
  "disconnected": () => void;
  "reconnecting": (attempt: number) => void;
  "reconnect_failed": () => void;
  "task": (task: Task) => void;
  "notify": (msg: Message) => void;
  "message": (msg: Message) => void;
  "error": (payload: unknown) => void;
  "task_queued": (task: ClientTask) => void;
  "task_started": (task: ClientTask) => void;
  "task_completed": (task: ClientTask) => void;
  "task_failed": (task: ClientTask) => void;
  "task_skipped": (task: ClientTask) => void;
};

export interface ClientOptions {
  id: string;
  servers: string[];
  heartbeatInterval?: number;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  autoSendResult?: boolean;
}

export class Client extends EventEmitter<ClientEvents> {
  protected transport: ClientTransport;
  private heartbeat: Heartbeat;
  private handler: TaskHandler | null = null;
  private queue: ClientTask[] = [];
  private running: ClientTask | null = null;
  private taskCounter = 0;
  private history: ClientTask[] = [];
  private static readonly HISTORY_LIMIT = 20;

  constructor(protected options: ClientOptions) {
    super();

    this.transport = new ClientTransport({
      url: options.servers[0] + "?clientId=" + encodeURIComponent(options.id),
      reconnect: options.reconnect ?? true,
      reconnectInterval: options.reconnectInterval,
      maxReconnectAttempts: options.maxReconnectAttempts,
    });

    this.heartbeat = new Heartbeat(
      options.id,
      (msg) => this.transport.send(msg),
      () => ({
        queueLength: this.queue.length,
        running: this.running !== null,
        uptime: 0,
      }),
      options.heartbeatInterval ?? 10000
    );

    this.setupTransport();
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get currentTask(): ClientTask | null {
    return this.running;
  }

  get taskQueue(): readonly ClientTask[] {
    return this.queue;
  }

  get taskHistory(): readonly ClientTask[] {
    return this.history;
  }

  doing(fn: TaskHandler): void {
    this.handler = fn;
    this.processNext();
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    this.heartbeat.start();
  }

  disconnect(): void {
    this.heartbeat.stop();
    this.transport.disconnect();
  }

  submit(options: SubmitOptions): void {
    const msg = createMessage("submit", this.options.id, "server", options);
    this.transport.send(msg);
  }

  send(subtype: string, payload: unknown): void {
    const msg = createMessage("message", this.options.id, "server", payload, { subtype });
    this.transport.send(msg);
  }

  sendTo(targetId: string, subtype: string, payload: unknown): void {
    const msg = createMessage("message", this.options.id, targetId, payload, { subtype });
    this.transport.send(msg);
  }

  private setupTransport(): void {
    this.transport.on("open", () => {
      this.heartbeat.start();
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

    this.transport.on("reconnect_failed", () => {
      this.emit("reconnect_failed");
    });
  }

  private handleMessage(msg: Message): void {
    switch (msg.type) {
      case "heartbeat_ack":
        break;
      case "dispatch":
        this.handleDispatch(msg);
        break;
      case "task":
        this.emit("task", msg.payload as Task);
        break;
      case "notify":
        this.emit("notify", msg);
        this.emit("message", msg);
        break;
      case "message":
        this.emit("message", msg);
        break;
      case "error":
        this.emit("error", msg.payload);
        break;
    }
  }

  private handleDispatch(msg: Message): void {
    const serverTask = msg.payload as Task;

    // 检查是否已有对应 ClientTask 正在执行或排队中（避免重复创建）
    const queued = this.queue.some((ct) => ct.serverTask.id === serverTask.id);
    const running = this.running?.serverTask.id === serverTask.id;
    if (queued || running) return;

    const clientTask: ClientTask = {
      id: `ct-${Date.now()}-${++this.taskCounter}`,
      serverTask,
      status: "pending",
    };

    this.queue.push(clientTask);
    this.emit("task_queued", clientTask);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.running || !this.handler || this.queue.length === 0) return;

    const task = this.queue.shift()!;
    this.running = task;
    task.status = "running";
    task.startedAt = Date.now();
    this.emit("task_started", task);

    try {
      const result = await this.handler(task);

      if (result === SKIP_RESULT) {
        this.emit("task_skipped", task);
        this.pushHistory(task);
        this.running = null;
        this.processNext();
        return;
      }

      task.status = "completed";
      task.result = result;
      task.completedAt = Date.now();
      this.emit("task_completed", task);
      this.pushHistory(task);
      if (this.options.autoSendResult !== false) {
        this.sendResult(task.serverTask.id, true, result);
      }
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = Date.now();
      this.emit("task_failed", task);
      this.pushHistory(task);
      if (this.options.autoSendResult !== false) {
        this.sendResult(
          task.serverTask.id,
          false,
          undefined,
          task.error
        );
      }
    }

    this.running = null;
    this.processNext();
  }

  private pushHistory(task: ClientTask): void {
    this.history.unshift(task);
    if (this.history.length > Client.HISTORY_LIMIT) {
      this.history.pop();
    }
  }

  private sendResult(taskId: string, success: boolean, data?: unknown, error?: string): void {
    const msg = createMessage("result", this.options.id, "server", {
      taskId,
      success,
      data,
      error,
    });
    try {
      this.transport.send(msg);
    } catch {
      // transport disconnected, result lost
    }
  }
}
