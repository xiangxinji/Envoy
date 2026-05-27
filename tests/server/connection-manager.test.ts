import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionManager } from "../../packages/server/connection-manager.js";

describe("ConnectionManager", () => {
  let cm: ConnectionManager;

  beforeEach(() => {
    cm = new ConnectionManager({ heartbeatTimeout: 60000 });
  });

  it("addClient 注册在线客户端", () => {
    cm.addClient("c1");
    const client = cm.getClient("c1");
    expect(client).toBeDefined();
    expect(client!.id).toBe("c1");
    expect(client!.role).toBe("client");
    expect(client!.status).toBe("online");
    expect(client!.connectedAt).toBeTypeOf("number");
    expect(client!.lastHeartbeat).toBeTypeOf("number");
  });

  it("addClient 支持 watcher 角色", () => {
    cm.addClient("w1", "watcher");
    expect(cm.getClient("w1")!.role).toBe("watcher");
  });

  it("addClient 触发 client:online 事件", () => {
    const handler = vi.fn();
    cm.on("client:online", handler);
    cm.addClient("c1");
    expect(handler).toHaveBeenCalledWith("c1");
  });

  it("removeClient 删除客户端", () => {
    cm.addClient("c1");
    cm.removeClient("c1");
    expect(cm.getClient("c1")).toBeUndefined();
  });

  it("removeClient 不存在的客户端不报错", () => {
    expect(() => cm.removeClient("ghost")).not.toThrow();
  });

  it("getClient 返回 undefined 查找不存在的客户端", () => {
    expect(cm.getClient("nobody")).toBeUndefined();
  });

  it("getAllClients 返回所有客户端", () => {
    cm.addClient("c1");
    cm.addClient("c2");
    expect(cm.getAllClients()).toHaveLength(2);
    expect(cm.getAllClients().map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("getOnlineClients 只返回在线客户端", () => {
    cm.addClient("c1");
    cm.addClient("c2");
    cm.removeClient("c1");
    const online = cm.getOnlineClients();
    expect(online).toHaveLength(1);
    expect(online[0].id).toBe("c2");
  });

  it("getWatchers 只返回 watcher 角色", () => {
    cm.addClient("c1");
    cm.addClient("w1", "watcher");
    cm.addClient("w2", "watcher");
    const watchers = cm.getWatchers();
    expect(watchers).toHaveLength(2);
    expect(watchers.map((w) => w.id).sort()).toEqual(["w1", "w2"]);
  });

  it("isOnline 返回正确的在线状态", () => {
    cm.addClient("c1");
    expect(cm.isOnline("c1")).toBe(true);
    expect(cm.isOnline("c2")).toBe(false);
    cm.removeClient("c1");
    expect(cm.isOnline("c1")).toBe(false);
  });

  it("updateHeartbeat 更新心跳时间和队列信息", () => {
    cm.addClient("c1");
    const before = cm.getClient("c1")!.lastHeartbeat;
    cm.updateHeartbeat("c1", { queueLength: 3, running: true, uptime: 42 });
    const client = cm.getClient("c1")!;
    expect(client.lastHeartbeat).toBeGreaterThanOrEqual(before);
    expect(client.queueLength).toBe(3);
    expect(client.uptime).toBe(42);
  });

  it("updateHeartbeat 不存在的客户端不报错", () => {
    expect(() => cm.updateHeartbeat("ghost", { queueLength: 0, running: false, uptime: 0 })).not.toThrow();
  });

  describe("心跳超时检测", () => {
    it("超时的客户端被自动移除并触发 client:offline", () => {
      vi.useFakeTimers();
      const cm = new ConnectionManager({ heartbeatTimeout: 1000 });
      const offlineHandler = vi.fn();
      cm.on("client:offline", offlineHandler);

      cm.addClient("c1");
      cm.startTimeoutChecker();

      // checker interval = min(timeout/2, 10000) = 500ms
      // need to advance past both the checker interval AND the timeout
      vi.advanceTimersByTime(2000);

      expect(offlineHandler).toHaveBeenCalledWith("c1");
      expect(cm.getClient("c1")).toBeUndefined();

      cm.stopTimeoutChecker();
      vi.useRealTimers();
    });

    it("及时更新心跳的客户端不被移除", () => {
      vi.useFakeTimers();
      const cm = new ConnectionManager({ heartbeatTimeout: 2000 });
      const offlineHandler = vi.fn();
      cm.on("client:offline", offlineHandler);

      cm.addClient("c1");
      cm.startTimeoutChecker();

      vi.advanceTimersByTime(1500);
      cm.updateHeartbeat("c1", { queueLength: 0, running: false, uptime: 0 });
      vi.advanceTimersByTime(1500);

      expect(offlineHandler).not.toHaveBeenCalled();
      expect(cm.isOnline("c1")).toBe(true);

      cm.stopTimeoutChecker();
      vi.useRealTimers();
    });

    it("stopTimeoutChecker 停止检测", () => {
      vi.useFakeTimers();
      const cm = new ConnectionManager({ heartbeatTimeout: 1000 });
      const offlineHandler = vi.fn();
      cm.on("client:offline", offlineHandler);

      cm.addClient("c1");
      cm.startTimeoutChecker();
      cm.stopTimeoutChecker();

      vi.advanceTimersByTime(5000);

      expect(offlineHandler).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
