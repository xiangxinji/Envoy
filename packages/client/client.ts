import { EventEmitter } from "../core/event-emitter.js";
import { createMessage } from "../core/message.js";
import type { Message } from "../core/message.js";
import type { Task, SubmitOptions } from "../core/task.js";
import { ClientTransport } from "./transport.js";
import { Heartbeat } from "./heartbeat.js";

export type TaskHandler = (task: Task) => Promise<unknown>;

export type ClientEvents = {
  "connected": () => void;
  "disconnected": () => void;
  "reconnecting": (attempt: number) => void;
  "task": (task: Task) => void;
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
  protected transport: ClientTransport;
  private heartbeat: Heartbeat;
  private handler: TaskHandler | null = null;
  private queue: Task[] = [];
  private running: Task | null = null;

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

  doing(fn: TaskHandler): void {
    this.handler = fn;
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
    const task = msg.payload as Task;
    this.queue.push(task);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.running || !this.handler || this.queue.length === 0) return;

    this.running = this.queue.shift()!;
    try {
      const result = await this.handler(this.running);
      this.sendResult(this.running.id, true, result);
    } catch (err) {
      this.sendResult(
        this.running.id,
        false,
        undefined,
        err instanceof Error ? err.message : String(err)
      );
    }
    this.running = null;
    this.processNext();
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
