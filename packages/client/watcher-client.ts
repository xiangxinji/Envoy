import { Client } from "./client.js";
import type { ClientOptions } from "./client.js";
import type { Task } from "../core/task.js";
import type { ClientState } from "../server/index.js";

export interface WatcherClientEvents {
  "connected": () => void;
  "disconnected": () => void;
  "task:created": (task: Task) => void;
  "task:updated": (task: Task) => void;
  "task:completed": (task: Task) => void;
  "task:failed": (task: Task) => void;
  "client:online": (state: ClientState) => void;
  "client:offline": (info: { id: string }) => void;
}

export class WatcherClient extends Client {
  constructor(options: ClientOptions) {
    super(options);
    (this.transport as any).options.url += "&role=watcher";
    this.setupWatcherHandlers();
  }

  private setupWatcherHandlers(): void {
    this.on("task", (task: Task) => {
      switch (task.status) {
        case "pending":
          this.emit("task:created" as any, task);
          break;
        case "running":
          this.emit("task:updated" as any, task);
          break;
        case "completed":
          this.emit("task:completed" as any, task);
          break;
        case "failed":
          this.emit("task:failed" as any, task);
          break;
      }
    });

    this.on("message", (msg) => {
      if (msg.type === "notify") {
        const subtype = (msg as any).subtype;
        if (subtype === "client:online") {
          this.emit("client:online" as any, (msg as any).payload as ClientState);
        } else if (subtype === "client:offline") {
          this.emit("client:offline" as any, (msg as any).payload as { id: string });
        }
      }
    });
  }
}
