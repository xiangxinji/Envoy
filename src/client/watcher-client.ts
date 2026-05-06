import { Client } from "./client.js";
import type { ClientOptions } from "./client.js";
import { createMessage } from "../core/message.js";
import type { ClientState } from "../server/index.js";
import type { CapabilityDefinition } from "../core/capability.js";

export interface WatcherSnapshot {
  clients: ClientState[];
  capabilities: CapabilityDefinition[];
}

export interface WatcherClientEvents {
  "snapshot": (snapshot: WatcherSnapshot) => void;
  "client:online": (state: ClientState) => void;
  "client:offline": (info: { id: string }) => void;
  "client:registered": (data: { clientId: string; capabilities: CapabilityDefinition[] }) => void;
}

export class WatcherClient extends Client {
  private snapshot: WatcherSnapshot | null = null;
  private snapshotResolver: ((snapshot: WatcherSnapshot) => void) | null = null;

  constructor(options: ClientOptions) {
    super(options);
    this.setupWatcherHandlers();
  }

  protected override sendRegister(): void {
    const msg = createMessage("register", this.options.id, "server", {
      watcher: true,
      capabilities: [],
    });
    this.transport.send(msg);
  }

  private setupWatcherHandlers(): void {
    this.on("notify", (msg) => {
      if (msg.subtype === "snapshot" && msg.payload) {
        this.snapshot = msg.payload as WatcherSnapshot;
        this.emit("snapshot", this.snapshot);
        if (this.snapshotResolver) {
          this.snapshotResolver(this.snapshot);
          this.snapshotResolver = null;
        }
      }
    });

    this.on("notify:client:online", (state) => {
      this.emit("client:online", state as ClientState);
    });

    this.on("notify:client:offline", (info) => {
      this.emit("client:offline", info as { id: string });
    });

    this.on("notify:client:registered", (data) => {
      this.emit("client:registered", data as { clientId: string; capabilities: CapabilityDefinition[] });
    });
  }

  getSnapshot(): WatcherSnapshot | null {
    return this.snapshot;
  }

  waitForSnapshot(): Promise<WatcherSnapshot> {
    if (this.snapshot) {
      return Promise.resolve(this.snapshot);
    }
    return new Promise((resolve) => {
      this.snapshotResolver = resolve;
    });
  }
}