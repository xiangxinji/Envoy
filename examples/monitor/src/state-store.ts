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

export class StateStore {
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
  }

  applyClientOnline(state: ClientState): void {
    this.clients.set(state.id, state);
  }

  applyClientOffline(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.status = "offline";
    }
  }

  applyClientRegistered(data: { clientId: string; capabilities: CapabilityDefinition[] }): void {
    this.capabilities = this.capabilities.filter(
      (c) => !data.capabilities.some((nc) => nc.name === c.name)
    );
    this.capabilities.push(...data.capabilities);
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
      connectedAt: this._connected ? 1 : 0,
    };
  }
}
