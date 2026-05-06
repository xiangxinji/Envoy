import { EventEmitter } from "../core/event-emitter.js";

export interface ClientState {
  id: string;
  status: "online" | "offline" | "busy";
  connectedAt: number;
  lastHeartbeat: number;
  queueLength: number;
  currentTask?: {
    taskId: string;
    taskName: string;
    progress?: number;
  };
  uptime: number;
  memoryUsage?: number;
}

export interface ConnectionManagerOptions {
  heartbeatTimeout?: number; // ms, default 30000
}

export class ConnectionManager extends EventEmitter {
  private clients = new Map<string, ClientState>();
  private timeoutChecker: ReturnType<typeof setInterval> | null = null;

  constructor(private options: ConnectionManagerOptions = {}) {
    super();
  }

  addClient(clientId: string): void {
    const now = Date.now();
    this.clients.set(clientId, {
      id: clientId,
      status: "online",
      connectedAt: now,
      lastHeartbeat: now,
      queueLength: 0,
      uptime: 0,
    });
    this.emit("client:online", clientId);
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.status = "offline";
      this.clients.delete(clientId);
      this.emit("client:offline", clientId);
    }
  }

  updateHeartbeat(
    clientId: string,
    payload: {
      queueLength: number;
      running?: { taskId: string; taskName: string; progress?: number };
      uptime: number;
      memoryUsage?: number;
    }
  ): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastHeartbeat = Date.now();
    client.queueLength = payload.queueLength;
    client.currentTask = payload.running;
    client.uptime = payload.uptime;
    client.memoryUsage = payload.memoryUsage;
    client.status = payload.running ? "busy" : "online";
  }

  getClient(clientId: string): ClientState | undefined {
    return this.clients.get(clientId);
  }

  getAllClients(): ClientState[] {
    return [...this.clients.values()];
  }

  getOnlineClients(): ClientState[] {
    return this.getAllClients().filter((c) => c.status !== "offline");
  }

  startTimeoutChecker(): void {
    const timeout = this.options.heartbeatTimeout ?? 30000;
    this.timeoutChecker = setInterval(() => {
      const now = Date.now();
      for (const client of this.clients.values()) {
        if (client.status !== "offline" && now - client.lastHeartbeat > timeout) {
          client.status = "offline";
          this.emit("client:offline", client.id);
        }
      }
    }, Math.min(timeout / 2, 10000));
  }

  stopTimeoutChecker(): void {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }
  }
}
