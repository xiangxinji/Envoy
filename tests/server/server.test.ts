import { describe, it, expect, vi, beforeEach } from "vitest";
import { Server } from "../../packages/server/server.js";
import type { SerializedTaskState } from "../../packages/server/server.js";
import type { Task } from "../../packages/core/task.js";

function createTestServer(): { server: Server; sent: Map<string, unknown[]> } {
  const server = new Server({ port: 9999, heartbeatTimeout: 60000 });
  const sent = new Map<string, unknown[]>();

  const transport = (server as any).transport;
  transport.send = (clientId: string, msg: unknown) => {
    let list = sent.get(clientId);
    if (!list) {
      list = [];
      sent.set(clientId, list);
    }
    list.push(msg);
  };

  const cm = (server as any).connectionManager;

  return { server, sent, cm };
}

function addOnlineClient(cm: any, id: string, role: "client" | "watcher" = "client") {
  cm.addClient(id, role);
}

function getTaskId(sent: Map<string, unknown[]>, clientId: string): string | undefined {
  const msgs = sent.get(clientId);
  if (!msgs || msgs.length === 0) return undefined;
  const msg = msgs[0] as any;
  return msg?.payload?.id;
}

describe("Server 单元测试", () => {
  let server: Server;
  let sent: Map<string, unknown[]>;
  let cm: any;

  beforeEach(() => {
    const env = createTestServer();
    server = env.server;
    sent = env.sent;
    cm = env.cm;
  });

  describe("任务创建", () => {
    it("submitFrom 创建任务并返回 taskId", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "worker");

      const taskId = server.submitFrom("boss", {
        content: "test task",
        subscribe: ["worker"],
        mode: "serial",
      });

      expect(taskId).toMatch(/^task-/);
      expect(server.getTask(taskId)).toBeDefined();
      expect(server.getTask(taskId)!.content).toBe("test task");
      expect(server.getTask(taskId)!.status).toBe("pending");
      expect(server.getTask(taskId)!.createBy).toBe("boss");
      expect(server.getTask(taskId)!.attempt).toBe(1);
    });

    it("submitFrom 触发 task:created 事件", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "worker");
      const handler = vi.fn();
      server.on("task:created", handler);

      server.submitFrom("boss", {
        content: "new task",
        subscribe: ["worker"],
        mode: "serial",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].content).toBe("new task");
    });

    it("getAllTasks 返回所有任务", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "worker");

      server.submitFrom("boss", { content: "t1", subscribe: ["worker"], mode: "serial" });
      server.submitFrom("boss", { content: "t2", subscribe: ["worker"], mode: "serial" });

      expect(server.getAllTasks()).toHaveLength(2);
    });
  });

  describe("serial 分发", () => {
    it("向 subscribe 列表第一个成员发送 dispatch", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");
      addOnlineClient(cm, "w2");

      server.submitFrom("boss", {
        content: "serial-task",
        subscribe: ["w1", "w2"],
        mode: "serial",
      });

      // w1 应该收到 dispatch
      const w1Msgs = (sent.get("w1") || []) as any[];
      expect(w1Msgs.some((m) => m.type === "dispatch")).toBe(true);

      // w2 不应该收到 dispatch（serial 模式逐个）
      const w2Msgs = (sent.get("w2") || []) as any[];
      expect(w2Msgs.some((m) => m.type === "dispatch")).toBe(false);
    });

    it("target 离线时不发送 dispatch，等待重连", () => {
      addOnlineClient(cm, "boss");
      // w1 不注册

      server.submitFrom("boss", {
        content: "offline-task",
        subscribe: ["w1"],
        mode: "serial",
      });

      expect(sent.has("w1")).toBe(false);
      const task = server.getAllTasks()[0];
      expect(task.status).toBe("pending");
    });
  });

  describe("parallel 分发", () => {
    it("向所有在线 target 同时发送 dispatch", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");
      addOnlineClient(cm, "w2");

      server.submitFrom("boss", {
        content: "parallel-task",
        subscribe: ["w1", "w2"],
        mode: "parallel",
      });

      expect(sent.has("w1")).toBe(true);
      expect(sent.has("w2")).toBe(true);
    });

    it("离线 target 不发送但保留在 pendingClients", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");
      // w2 不注册

      const taskId = server.submitFrom("boss", {
        content: "partial-task",
        subscribe: ["w1", "w2"],
        mode: "parallel",
      });

      expect(sent.has("w1")).toBe(true);
      expect(sent.has("w2")).toBe(false);

      const state = server.getTaskState(taskId);
      expect(state!.pendingClients).toContain("w2");
    });
  });

  describe("processResult", () => {
    it("member 成功结果追加到 resources", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "result-test",
        subscribe: ["w1"],
        mode: "serial",
      });

      server.receiveResult("w1", taskId, true, "done");

      const task = server.getTask(taskId)!;
      expect(task.resources).toHaveLength(1);
      expect(task.resources[0]).toEqual({
        type: "client-result",
        by: "w1",
        data: "done",
        attempt: 1,
        timestamp: expect.any(Number),
      });
    });

    it("member 失败标记 task 为 failed", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "fail-test",
        subscribe: ["w1"],
        mode: "serial",
      });

      const failedHandler = vi.fn();
      server.on("task:failed", failedHandler);

      server.receiveResult("w1", taskId, false, undefined, "boom");

      expect(server.getTask(taskId)!.status).toBe("failed");
      expect(failedHandler).toHaveBeenCalledTimes(1);
    });

    it("serial 模式全部完成后进入 leader review", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");
      addOnlineClient(cm, "w2");

      const taskId = server.submitFrom("boss", {
        content: "review-test",
        subscribe: ["w1", "w2"],
        mode: "serial",
      });

      server.receiveResult("w1", taskId, true, "r1");

      // w1 完成后，server 应该 dispatch 给 w2
      expect(server.getTask(taskId)!.status).toBe("pending");

      server.receiveResult("w2", taskId, true, "r2");

      // 全部完成，进入 review
      expect(server.getTask(taskId)!.status).toBe("reviewing");
      expect(server.getTaskState(taskId)!.leaderReviewing).toBe(true);

      // boss 应该收到 review dispatch
      const bossMsgs = sent.get("boss") || [];
      const reviewDispatch = bossMsgs.find((m: any) => m.type === "dispatch" && m.subtype === "review");
      expect(reviewDispatch).toBeDefined();
    });

    it("parallel 模式全部完成后进入 leader review", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");
      addOnlineClient(cm, "w2");

      const taskId = server.submitFrom("boss", {
        content: "par-review",
        subscribe: ["w1", "w2"],
        mode: "parallel",
      });

      server.receiveResult("w1", taskId, true, "r1");
      server.receiveResult("w2", taskId, true, "r2");

      expect(server.getTask(taskId)!.status).toBe("reviewing");
    });
  });

  describe("Leader Review", () => {
    function setupTaskForReview() {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "review-flow",
        subscribe: ["w1"],
        mode: "serial",
      });

      server.receiveResult("w1", taskId, true, "worker-result");
      return taskId;
    }

    it("leader 审核通过 → task completed", () => {
      const taskId = setupTaskForReview();

      const completedHandler = vi.fn();
      server.on("task:completed", completedHandler);

      server.receiveResult("boss", taskId, true, "approved");

      expect(server.getTask(taskId)!.status).toBe("completed");
      expect(completedHandler).toHaveBeenCalledTimes(1);

      const task = server.getTask(taskId)!;
      const reviewResource = task.resources.find((r) => r.type === "leader-review");
      expect(reviewResource).toBeDefined();
      expect(reviewResource!.data).toEqual({ success: true, data: "approved" });
    });

    it("leader 审核失败 → 重试", () => {
      const taskId = setupTaskForReview();

      server.receiveResult("boss", taskId, false, undefined, "not good enough");

      expect(server.getTask(taskId)!.status).toBe("pending");
      expect(server.getTask(taskId)!.attempt).toBe(2);
      expect(server.getTaskState(taskId)!.leaderReviewing).toBe(false);
      expect(server.getTaskState(taskId)!.retryCount).toBe(1);
    });

    it("leader 审核失败重试 10 次后 → task failed", () => {
      const taskId = setupTaskForReview();

      // retryCount < 10 → reset, retryCount++ (0→1, 1→2, ..., 9→10)
      // on the 11th leader fail, retryCount=10, NOT < 10, so failed
      for (let i = 0; i < 10; i++) {
        server.receiveResult("boss", taskId, false, undefined, `fail ${i + 1}`);
        // worker re-completes after each retry
        server.receiveResult("w1", taskId, true, `retry-result-${i + 1}`);
      }
      // Now retryCount=10, task is back in reviewing
      // Final boss fail → task failed
      server.receiveResult("boss", taskId, false, undefined, "final fail");

      expect(server.getTask(taskId)!.status).toBe("failed");
    });
  });

  describe("重试机制", () => {
    it("resetForRetry 重置所有状态", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "retry-test",
        subscribe: ["w1"],
        mode: "serial",
      });

      server.receiveResult("w1", taskId, true, "r1");
      server.receiveResult("boss", taskId, false, undefined, "retry");

      const task = server.getTask(taskId)!;
      expect(task.attempt).toBe(2);
      expect(task.status).toBe("pending");

      const state = server.getTaskState(taskId)!;
      expect(state.retryCount).toBe(1);
      expect(state.serialIndex).toBe(0);
      expect(state.leaderReviewing).toBe(false);
      expect(state.pendingClients).toContain("w1");
    });
  });

  describe("handleClientOffline", () => {
    it("leader 审核中离线 → 直接完成 task", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "leader-offline",
        subscribe: ["w1"],
        mode: "serial",
      });

      server.receiveResult("w1", taskId, true, "r1");
      // 现在 task 在 reviewing 状态
      expect(server.getTask(taskId)!.status).toBe("reviewing");

      // leader 离线
      const completedHandler = vi.fn();
      server.on("task:completed", completedHandler);

      cm.removeClient("boss");
      // 触发 connectionManager 的 offline 事件
      cm.emit("client:offline", "boss");

      expect(server.getTask(taskId)!.status).toBe("completed");
      expect(completedHandler).toHaveBeenCalledTimes(1);
    });

    it("member 离线不影响 task 状态，等待重连", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "member-offline",
        subscribe: ["w1"],
        mode: "serial",
      });

      // member 离线
      cm.removeClient("w1");
      (server as any).handleClientOffline("w1");

      expect(server.getTask(taskId)!.status).toBe("pending");
      expect(server.getTaskState(taskId)!.pendingClients).toContain("w1");
    });
  });

  describe("reassignPendingTasks", () => {
    it("重连的 client 收到 pending 任务的 dispatch", () => {
      addOnlineClient(cm, "boss");
      // w1 未注册

      const taskId = server.submitFrom("boss", {
        content: "reconnect-test",
        subscribe: ["w1"],
        mode: "serial",
      });

      expect(sent.has("w1")).toBe(false);

      // w1 上线
      addOnlineClient(cm, "w1");
      (server as any).reassignPendingTasks("w1");

      expect(sent.has("w1")).toBe(true);
      const dispatch = (sent.get("w1")![0] as any);
      expect(dispatch.type).toBe("dispatch");
    });
  });

  describe("状态恢复", () => {
    it("loadTaskStates 加载持久化状态", () => {
      const task: Task = {
        id: "task-restored-1",
        createBy: "boss",
        subscribe: ["w1"],
        content: "restored",
        mode: "serial",
        status: "pending",
        resources: [],
        createdAt: Date.now(),
        attempt: 1,
      };

      const state: SerializedTaskState = {
        serialIndex: 0,
        pendingClients: ["w1"],
        leaderReviewing: false,
        retryCount: 0,
      };

      server.loadTaskStates([{ task, state }]);
      expect(server.getTask("task-restored-1")).toBeDefined();
      expect(server.getTaskState("task-restored-1")).toEqual(state);
    });

    it("loadTaskStates 不覆盖已存在的 task", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "existing",
        subscribe: ["w1"],
        mode: "serial",
      });

      const originalTask = server.getTask(taskId)!;

      server.loadTaskStates([{
        task: { ...originalTask, content: "overwritten" },
        state: { serialIndex: 0, pendingClients: [], leaderReviewing: false, retryCount: 0 },
      }]);

      expect(server.getTask(taskId)!.content).toBe("existing");
    });

    it("redispatchRestoredTasks 重新分发 pending 任务", () => {
      const task: Task = {
        id: "task-redispatch",
        createBy: "boss",
        subscribe: ["w1"],
        content: "redispatch",
        mode: "serial",
        status: "pending",
        resources: [],
        createdAt: Date.now(),
        attempt: 1,
      };

      server.loadTaskStates([{
        task,
        state: { serialIndex: 0, pendingClients: ["w1"], leaderReviewing: false, retryCount: 0 },
      }]);

      addOnlineClient(cm, "w1");
      server.redispatchRestoredTasks();

      expect(sent.has("w1")).toBe(true);
    });

    it("redispatchRestoredTasks 向在线 client 补发 running 任务", () => {
      const task: Task = {
        id: "task-running",
        createBy: "boss",
        subscribe: ["w1"],
        content: "running-task",
        mode: "serial",
        status: "running",
        resources: [],
        createdAt: Date.now(),
        attempt: 1,
      };

      server.loadTaskStates([{
        task,
        state: { serialIndex: 0, pendingClients: ["w1"], leaderReviewing: false, retryCount: 0 },
      }]);

      addOnlineClient(cm, "w1");
      server.redispatchRestoredTasks();

      expect(sent.has("w1")).toBe(true);
    });
  });

  describe("消息中转", () => {
    it("relay 转发 P2P 消息到在线客户端", () => {
      addOnlineClient(cm, "a");
      addOnlineClient(cm, "b");

      server.relay("a", "b", "chat", { text: "hi" });

      expect(sent.has("b")).toBe(true);
      const msg = sent.get("b")![0] as any;
      expect(msg.type).toBe("message");
      expect(msg.from).toBe("a");
      expect(msg.subtype).toBe("chat");
    });

    it("relay 不转发给离线客户端", () => {
      addOnlineClient(cm, "a");
      // b 不注册

      server.relay("a", "b", "chat", { text: "hi" });

      expect(sent.has("b")).toBe(false);
    });

    it("notify 向指定客户端发送通知", () => {
      addOnlineClient(cm, "c1");

      server.notify("c1", "alert", { level: "info" });

      expect(sent.has("c1")).toBe(true);
      const msg = sent.get("c1")![0] as any;
      expect(msg.type).toBe("notify");
      expect(msg.subtype).toBe("alert");
    });
  });

  describe("addResourceToTask", () => {
    it("手动追加资源到任务", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "resource-test",
        subscribe: ["w1"],
        mode: "serial",
      });

      server.addResourceToTask(taskId, "custom", "external", { file: "a.txt" });

      const task = server.getTask(taskId)!;
      expect(task.resources).toHaveLength(1);
      expect(task.resources[0].type).toBe("custom");
      expect(task.resources[0].by).toBe("external");
    });

    it("不存在的 task 静默忽略", () => {
      expect(() => server.addResourceToTask("ghost", "t", "b", {})).not.toThrow();
    });
  });

  describe("startTask", () => {
    it("手动将 pending 任务设为 running", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "manual-start",
        subscribe: ["w1"],
        mode: "serial",
      });

      const result = server.startTask(taskId);
      expect(result).not.toBeNull();
      expect(result!.status).toBe("running");
    });

    it("已经是 running 的任务返回 task 但不重复设置", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "already-running",
        subscribe: ["w1"],
        mode: "serial",
      });

      server.startTask(taskId);
      const result = server.startTask(taskId);
      expect(result).not.toBeNull();
      expect(result!.status).toBe("running");
    });

    it("completed/failed 状态的任务返回 null", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");

      const taskId = server.submitFrom("boss", {
        content: "done-task",
        subscribe: ["w1"],
        mode: "serial",
      });

      server.receiveResult("w1", taskId, false, undefined, "error");
      expect(server.startTask(taskId)).toBeNull();
    });

    it("不存在的 task 返回 null", () => {
      expect(server.startTask("ghost")).toBeNull();
    });
  });

  describe("getTaskState", () => {
    it("返回完整的 TaskState", () => {
      addOnlineClient(cm, "boss");
      addOnlineClient(cm, "w1");
      addOnlineClient(cm, "w2");

      const taskId = server.submitFrom("boss", {
        content: "state-test",
        subscribe: ["w1", "w2"],
        mode: "serial",
      });

      const state = server.getTaskState(taskId);
      expect(state).toEqual({
        serialIndex: 0,
        pendingClients: ["w1", "w2"],
        leaderReviewing: false,
        retryCount: 0,
      });
    });

    it("不存在的 task 返回 null", () => {
      expect(server.getTaskState("ghost")).toBeNull();
    });
  });
});
