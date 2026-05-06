import type { CapabilityDefinition } from "../core/capability.js";

/**
 * 能力注册表
 * 管理客户端注册的能力，支持按客户端或能力名称查询
 */
export class CapabilityRegistry {
  /** 客户端 ID → 能力映射表 */
  private clientCaps = new Map<string, Map<string, CapabilityDefinition>>();
  /** 能力名称 → 客户端 ID 集合映射表 */
  private capClients = new Map<string, Set<string>>();

  /** 注册客户端能力 */
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

  /** 注销客户端的所有能力 */
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

  /** 获取指定客户端注册的所有能力 */
  getClientCapabilities(clientId: string): CapabilityDefinition[] {
    const caps = this.clientCaps.get(clientId);
    return caps ? [...caps.values()] : [];
  }

  /** 获取拥有指定能力的所有客户端 ID */
  getClientsForCapability(capName: string): string[] {
    const clients = this.capClients.get(capName);
    return clients ? [...clients] : [];
  }

  /** 检查客户端是否拥有指定能力 */
  hasCapability(clientId: string, capName: string): boolean {
    return this.clientCaps.get(clientId)?.has(capName) ?? false;
  }

  /** 获取所有客户端的能力映射 */
  getAllCapabilities(): Map<string, CapabilityDefinition[]> {
    const result = new Map<string, CapabilityDefinition[]>();
    for (const [clientId, caps] of this.clientCaps) {
      result.set(clientId, [...caps.values()]);
    }
    return result;
  }
}
