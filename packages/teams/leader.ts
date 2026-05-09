import { Client } from "../client/client.js";
import type { Message } from "../core/message.js";
import type { ResourceAck, ResourceRegisterPayload, ResourceDeletePayload, LeaderOptions } from "./types.js";

export class Leader extends Client {
  private pendingOps = new Map<string, {
    resolve: (ack: ResourceAck) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  constructor(options: LeaderOptions) {
    super(options);
    this.setupResourceHandlers();
  }

  override async connect(): Promise<void> {
    await super.connect();
    this.send("team:join", { role: "leader" });
  }

  async registerResource(resourcePath: string, content: string): Promise<ResourceAck> {
    const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOps.delete(operationId);
        reject(new Error("Resource operation timed out"));
      }, 10000);
      this.pendingOps.set(operationId, { resolve, reject, timer });
      this.send("resource:register", {
        operationId,
        path: resourcePath,
        content,
      } satisfies ResourceRegisterPayload);
    });
  }

  async deleteResource(resourcePath: string): Promise<ResourceAck> {
    const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOps.delete(operationId);
        reject(new Error("Resource operation timed out"));
      }, 10000);
      this.pendingOps.set(operationId, { resolve, reject, timer });
      this.send("resource:delete", {
        operationId,
        path: resourcePath,
      } satisfies ResourceDeletePayload);
    });
  }

  private setupResourceHandlers(): void {
    this.on("notify", (msg: Message) => {
      if (msg.subtype !== "resource:ack") return;
      const ack = msg.payload as ResourceAck;
      const pending = this.pendingOps.get(ack.operationId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pendingOps.delete(ack.operationId);
      if (ack.success) pending.resolve(ack);
      else pending.reject(new Error(ack.error ?? "Operation failed"));
    });
  }
}
