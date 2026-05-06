import type { CapabilityDefinition } from "../core/capability.js";

export class CapabilityRegistry {
  // clientId → capabilities
  private clientCaps = new Map<string, Map<string, CapabilityDefinition>>();
  // capabilityName → clientIds
  private capClients = new Map<string, Set<string>>();

  register(clientId: string, capability: CapabilityDefinition): void {
    let caps = this.clientCaps.get(clientId);
    if (!caps) {
      caps = new Map();
      this.clientCaps.set(clientId, caps);
    }
    caps.set(capability.name, capability);

    let clients = this.capClients.get(capability.name);
    if (!clients) {
      clients = new Set();
      this.capClients.set(capability.name, clients);
    }
    clients.add(clientId);
  }

  unregister(clientId: string): void {
    const caps = this.clientCaps.get(clientId);
    if (caps) {
      for (const capName of caps.keys()) {
        this.capClients.get(capName)?.delete(clientId);
        if (this.capClients.get(capName)?.size === 0) {
          this.capClients.delete(capName);
        }
      }
      this.clientCaps.delete(clientId);
    }
  }

  getClientCapabilities(clientId: string): CapabilityDefinition[] {
    const caps = this.clientCaps.get(clientId);
    return caps ? [...caps.values()] : [];
  }

  getClientsForCapability(capName: string): string[] {
    const clients = this.capClients.get(capName);
    return clients ? [...clients] : [];
  }

  hasCapability(clientId: string, capName: string): boolean {
    return this.clientCaps.get(clientId)?.has(capName) ?? false;
  }

  getAllCapabilities(): Map<string, CapabilityDefinition[]> {
    const result = new Map<string, CapabilityDefinition[]>();
    for (const [clientId, caps] of this.clientCaps) {
      result.set(clientId, [...caps.values()]);
    }
    return result;
  }
}
