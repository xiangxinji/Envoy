import { EventEmitter } from "../core/event-emitter.js";

export interface ClientState {
  id: string;
  status: "online" | "offline";
  connectedAt: number;
  lastHeartbeat: number;
  queueLength: number;
  uptime: number;
}

export interface ConnectionManagerOptions {
  heartbeatTimeout?: number;
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
    payload: { queueLength: number; running: boolean; uptime: number }
  ): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.lastHeartbeat = Date.now();
    client.queueLength = payload.queueLength;
    client.uptime = payload.uptime;
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

  isOnline(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return client !== undefined && client.status !== "offline";
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
