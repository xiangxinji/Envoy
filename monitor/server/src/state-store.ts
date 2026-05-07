import { EventEmitter } from "node:events";
import type { WatcherSnapshot } from "uniopc/client";

type ClientState = WatcherSnapshot["clients"][number];
type CapabilityDefinition = WatcherSnapshot["capabilities"][number];

export interface MonitorStatus {
  totalClients: number;
  onlineClients: number;
  busyClients: number;
  totalCapabilities: number;
  connectedAt: number;
}

export interface StateStoreEvents {
  init: (data: { clients: ClientState[]; capabilities: CapabilityDefinition[]; status: MonitorStatus }) => void;
  "client:online": (state: ClientState) => void;
  "client:offline": (info: { id: string }) => void;
  "client:registered": (data: { clientId: string; capabilities: CapabilityDefinition[] }) => void;
}

function flattenCapabilities(raw: unknown): CapabilityDefinition[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const result: CapabilityDefinition[] = [];
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) result.push(...(value as CapabilityDefinition[]));
    }
    return result;
  }
  return [];
}

export class StateStore extends EventEmitter {
  private clients = new Map<string, ClientState>();
  private capabilities: CapabilityDefinition[] = [];
  private _connected = false;

  applySnapshot(snapshot: WatcherSnapshot): void {
    this.clients.clear();
    for (const client of snapshot.clients) {
      this.clients.set(client.id, client);
    }
    this.capabilities = flattenCapabilities(snapshot.capabilities as unknown);
    this._connected = true;
    this.emit("init", {
      clients: this.getAllClients(),
      capabilities: this.getCapabilities(),
      status: this.getStatus(),
    });
  }

  applyClientOnline(state: ClientState): void {
    this.clients.set(state.id, state);
    this.emit("client:online", state);
  }

  applyClientOffline(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.status = "offline";
    }
    this.emit("client:offline", { id });
  }

  applyClientRegistered(data: { clientId: string; capabilities: CapabilityDefinition[] }): void {
    this.capabilities = this.capabilities.filter(
      (c) => !data.capabilities.some((nc) => nc.name === c.name)
    );
    this.capabilities.push(...data.capabilities);
    this.emit("client:registered", data);
  }

  setDisconnected(): void {
    this._connected = false;
  }

  getAllClients(): ClientState[] {
    return [...this.clients.values()];
  }

  getClient(id: string): ClientState | undefined {
    return this.clients.get(id);
  }

  getCapabilities(): CapabilityDefinition[] {
    return [...this.capabilities];
  }

  isConnected(): boolean {
    return this._connected;
  }

  getStatus(): MonitorStatus {
    const clients = this.getAllClients();
    return {
      totalClients: clients.length,
      onlineClients: clients.filter((c) => c.status === "online").length,
      busyClients: clients.filter((c) => c.status === "busy").length,
      totalCapabilities: this.capabilities.length,
      connectedAt: this._connected ? Date.now() : 0,
    };
  }
}
