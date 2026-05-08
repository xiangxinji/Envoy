import { Client } from "../client/client.js";
import type { Message } from "../core/message.js";
import type { ResourceChangedEvent, ResourceQueryResult, MemberOptions } from "./types.js";

export class Member extends Client {
  private pendingQueries = new Map<string, {
    resolve: (data: any) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private queryCounter = 0;

  constructor(options: MemberOptions) {
    super(options);
    this.setupResourceHandlers();
  }

  override async connect(): Promise<void> {
    await super.connect();
    this.send("team:join", { role: "member" });
  }

  async listResources(): Promise<string[]> {
    const queryId = `q-${Date.now()}-${++this.queryCounter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error("Query timed out"));
      }, 10000);
      this.pendingQueries.set(queryId, { resolve, reject, timer });
      this.send("resource:query", { queryId, type: "list" });
    });
  }

  async getResource(resourcePath: string): Promise<string> {
    const queryId = `q-${Date.now()}-${++this.queryCounter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error("Query timed out"));
      }, 10000);
      this.pendingQueries.set(queryId, { resolve, reject, timer });
      this.send("resource:query", { queryId, type: "get", path: resourcePath });
    });
  }

  private setupResourceHandlers(): void {
    this.on("notify", (msg: Message) => {
      if (msg.subtype === "resource:query-result") {
        const result = msg.payload as ResourceQueryResult;
        const pending = this.pendingQueries.get(result.queryId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingQueries.delete(result.queryId);
        if (result.success) {
          pending.resolve(result.paths ?? result.content);
        } else {
          pending.reject(new Error(result.error ?? "Query failed"));
        }
      }
      if (msg.subtype === "resource:changed") {
        this.emit("resource-changed", msg.payload as ResourceChangedEvent);
      }
    });
  }
}
