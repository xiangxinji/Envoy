import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client, SKIP_RESULT, EXECUTION_TIMEOUT } from "../../packages/client/client.js";
import type { ClientTask } from "../../packages/client/client.js";
import type { Task } from "../../packages/core/task.js";
import { createMessage } from "../../packages/core/message.js";

function createMockClient(id = "test-client"): { client: Client; sent: unknown[]; transport: any } {
  const client = new Client({ id, servers: ["ws://localhost:0"], reconnect: false, heartbeatInterval: 60000 });
  const sent: unknown[] = [];
  const transport = (client as any).transport;

  transport.send = (msg: unknown) => {
    sent.push(msg);
  };

  return { client, sent, transport };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}`,
    createBy: "boss",
    subscribe: ["test-client"],
    content: "test-task",
    mode: "serial",
    status: "pending",
    resources: [],
    createdAt: Date.now(),
    attempt: 1,
    ...overrides,
  };
}

function dispatchTask(transport: any, task: Task, subtype?: string) {
  const msg = createMessage("dispatch", "server", "test-client", task, subtype ? { subtype } : undefined);
  transport.emit("message", msg);
}

describe("Client 单元测试", () => {
  describe("串行队列", () => {
    it("多个任务按顺序串行执行", async () => {
      const { client, transport } = createMockClient();
      const order: string[] = [];

      client.doing(async (ct: ClientTask) => {
        order.push(ct.serverTask.content);
        return "done";
      });

      const task1 = makeTask({ id: "t1", content: "first" });
      const task2 = makeTask({ id: "t2", content: "second" });
      const task3 = makeTask({ id: "t3", content: "third" });

      dispatchTask(transport, task1);
      dispatchTask(transport, task2);
      dispatchTask(transport, task3);

      // Wait for all tasks to complete
      await new Promise((r) => setTimeout(r, 100));

      expect(order).toEqual(["first", "second", "third"]);
    });

    it("同一时间只有一个任务在执行", async () => {
      const { client, transport } = createMockClient();
      let concurrency = 0;
      let maxConcurrency = 0;

      client.doing(async (ct: ClientTask) => {
        concurrency++;
        maxConcurrency = Math.max(maxConcurrency, concurrency);
        await new Promise((r) => setTimeout(r, 30));
        concurrency--;
        return "done";
      });

      for (let i = 0; i < 3; i++) {
        dispatchTask(transport, makeTask({ id: `t${i}`, content: `task-${i}` }));
      }

      await new Promise((r) => setTimeout(r, 200));
      expect(maxConcurrency).toBe(1);
    });
  });

  describe("SKIP_RESULT", () => {
    it("handler 返回 SKIP_RESULT 触发 task_skipped 事件", async () => {
      const { client, transport } = createMockClient();
      const skipped: ClientTask[] = [];

      client.on("task_skipped", (ct) => skipped.push(ct));

      client.doing(async (ct: ClientTask) => SKIP_RESULT);

      dispatchTask(transport, makeTask());

      await new Promise((r) => setTimeout(r, 50));

      expect(skipped).toHaveLength(1);
    });

    it("SKIP_RESULT 后队列继续处理下一个任务", async () => {
      const { client, transport } = createMockClient();
      const order: string[] = [];

      client.doing(async (ct: ClientTask) => {
        if (ct.serverTask.content === "skip-me") return SKIP_RESULT;
        order.push(ct.serverTask.content);
        return "done";
      });

      dispatchTask(transport, makeTask({ id: "t1", content: "skip-me" }));
      dispatchTask(transport, makeTask({ id: "t2", content: "do-me" }));

      await new Promise((r) => setTimeout(r, 50));

      expect(order).toEqual(["do-me"]);
    });
  });

  describe("EXECUTION_TIMEOUT", () => {
    it("handler 返回 EXECUTION_TIMEOUT 触发 task_failed", async () => {
      const { client, transport } = createMockClient();
      const failed: ClientTask[] = [];

      client.on("task_failed", (ct) => failed.push(ct));

      client.doing(async (ct: ClientTask) => EXECUTION_TIMEOUT);

      dispatchTask(transport, makeTask());

      await new Promise((r) => setTimeout(r, 50));

      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBe("execution_timeout");
    });
  });

  describe("handler 异常", () => {
    it("handler 抛错触发 task_failed", async () => {
      const { client, transport } = createMockClient();
      const failed: ClientTask[] = [];

      client.on("task_failed", (ct) => failed.push(ct));

      client.doing(async () => {
        throw new Error("boom");
      });

      dispatchTask(transport, makeTask());

      await new Promise((r) => setTimeout(r, 50));

      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBe("boom");
    });

    it("非 Error 类型的异常被转为字符串", async () => {
      const { client, transport } = createMockClient();
      const failed: ClientTask[] = [];

      client.on("task_failed", (ct) => failed.push(ct));

      client.doing(async () => {
        throw "string error";
      });

      dispatchTask(transport, makeTask());

      await new Promise((r) => setTimeout(r, 50));

      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBe("string error");
    });
  });

  describe("事件流", () => {
    it("正常执行触发 queued → started → completed → finished", async () => {
      const { client, transport } = createMockClient();
      const events: string[] = [];

      client.on("task_queued", () => events.push("queued"));
      client.on("task_started", () => events.push("started"));
      client.on("task_completed", () => events.push("completed"));
      client.on("task_finished", () => events.push("finished"));

      client.doing(async () => "ok");
      dispatchTask(transport, makeTask());

      await new Promise((r) => setTimeout(r, 50));

      expect(events).toEqual(["queued", "started", "completed", "finished"]);
    });
  });

  describe("去重逻辑", () => {
    it("同一 taskId 新 attempt 覆盖队列中的旧 attempt", async () => {
      const { client, transport } = createMockClient();
      const tasks: ClientTask[] = [];

      client.on("task_started", (ct) => tasks.push(ct));

      // 不要立即注册 doing，让任务先排队
      dispatchTask(transport, makeTask({ id: "t1", attempt: 1 }));
      dispatchTask(transport, makeTask({ id: "t1", attempt: 2 }));

      expect(client.queueLength).toBe(1);
      expect(client.taskQueue[0].serverTask.attempt).toBe(2);

      client.doing(async (ct) => "done");

      await new Promise((r) => setTimeout(r, 50));

      expect(tasks).toHaveLength(1);
      expect(tasks[0].serverTask.attempt).toBe(2);
    });

    it("正在执行的旧 attempt 被新 attempt 取代", async () => {
      const { client, transport } = createMockClient();
      const started: ClientTask[] = [];

      client.on("task_started", (ct) => started.push(ct));

      client.doing(async (ct) => {
        await new Promise((r) => setTimeout(r, 100));
        return `attempt-${ct.serverTask.attempt}`;
      });

      dispatchTask(transport, makeTask({ id: "t1", attempt: 1 }));
      await new Promise((r) => setTimeout(r, 20));

      // 任务正在执行，新 attempt 到达 → running 被清空，新任务立即开始
      dispatchTask(transport, makeTask({ id: "t1", attempt: 2 }));

      await new Promise((r) => setTimeout(r, 10));

      // 新 attempt 已经开始执行（running 被清空后 processNext 立即拾取新任务）
      expect(client.currentTask).not.toBeNull();
      expect(client.currentTask!.serverTask.attempt).toBe(2);
      expect(started.some((ct) => ct.serverTask.attempt === 2)).toBe(true);
    });
  });

  describe("history", () => {
    it("最多保留 20 条任务历史", async () => {
      const { client, transport } = createMockClient();

      client.doing(async () => "done");

      for (let i = 0; i < 25; i++) {
        dispatchTask(transport, makeTask({ id: `t${i}`, content: `task-${i}` }));
        await new Promise((r) => setTimeout(r, 10));
      }

      expect(client.taskHistory).toHaveLength(20);
      // 最新的在前面
      expect(client.taskHistory[0].serverTask.id).toBe("t24");
    });
  });

  describe("reviewing handler", () => {
    it("review dispatch 路由到 reviewing handler 而非 doing handler", async () => {
      const { client, transport } = createMockClient();
      const executeTasks: ClientTask[] = [];
      const reviewTasks: ClientTask[] = [];

      client.doing(async (ct) => {
        executeTasks.push(ct);
        return "executed";
      });

      client.reviewing(async (ct) => {
        reviewTasks.push(ct);
        return "reviewed";
      });

      // 普通 execute dispatch
      dispatchTask(transport, makeTask({ id: "t1", content: "execute" }));

      // review dispatch
      dispatchTask(transport, makeTask({ id: "t2", content: "review" }), "review");

      await new Promise((r) => setTimeout(r, 50));

      expect(executeTasks).toHaveLength(1);
      expect(executeTasks[0].serverTask.content).toBe("execute");
      expect(executeTasks[0].reason).toBe("execute");

      expect(reviewTasks).toHaveLength(1);
      expect(reviewTasks[0].serverTask.content).toBe("review");
      expect(reviewTasks[0].reason).toBe("review");
    });

    it("review 触发 review_queued/review_started/review_completed 事件", async () => {
      const { client, transport } = createMockClient();
      const events: string[] = [];

      client.on("review_queued", () => events.push("review_queued"));
      client.on("review_started", () => events.push("review_started"));
      client.on("review_completed", () => events.push("review_completed"));
      client.on("review_finished", () => events.push("review_finished"));

      client.reviewing(async () => "approved");
      dispatchTask(transport, makeTask(), "review");

      await new Promise((r) => setTimeout(r, 50));

      expect(events).toEqual(["review_queued", "review_started", "review_completed", "review_finished"]);
    });

    it("review 失败触发 review_failed 事件", async () => {
      const { client, transport } = createMockClient();
      const events: string[] = [];

      client.on("review_failed", () => events.push("review_failed"));

      client.reviewing(async () => {
        throw new Error("rejected");
      });

      dispatchTask(transport, makeTask(), "review");

      await new Promise((r) => setTimeout(r, 50));

      expect(events).toEqual(["review_failed"]);
    });
  });

  describe("review 方法", () => {
    it("review 调用 sendResult 发送审核结果", async () => {
      const { client, sent } = createMockClient();

      client.review("task-123", true, { summary: "looks good" });

      expect(sent).toHaveLength(1);
      const msg = sent[0] as any;
      expect(msg.type).toBe("result");
      expect(msg.payload).toEqual({
        taskId: "task-123",
        success: true,
        data: { summary: "looks good" },
        error: undefined,
      });
    });

    it("review 拒绝发送 success=false", async () => {
      const { client, sent } = createMockClient();

      client.review("task-456", false, undefined, "not acceptable");

      expect(sent).toHaveLength(1);
      const msg = sent[0] as any;
      expect(msg.payload.success).toBe(false);
      expect(msg.payload.error).toBe("not acceptable");
    });
  });

  describe("延迟注册 handler", () => {
    it("dispatch 到达时没有 handler，任务排队；注册后立即执行", async () => {
      const { client, transport } = createMockClient();
      const results: string[] = [];

      dispatchTask(transport, makeTask({ content: "delayed" }));
      expect(client.queueLength).toBe(1);

      client.doing(async (ct) => {
        results.push(ct.serverTask.content);
        return "done";
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(results).toEqual(["delayed"]);
      expect(client.queueLength).toBe(0);
    });
  });

  describe("消息处理", () => {
    it("task 类型消息触发 task 事件", async () => {
      const { client, transport } = createMockClient();
      const tasks: Task[] = [];

      client.on("task", (t) => tasks.push(t));

      const task = makeTask({ status: "running" });
      const msg = createMessage("task", "server", "test-client", task);
      transport.emit("message", msg);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe("running");
    });

    it("error 类型消息触发 error 事件", async () => {
      const { client, transport } = createMockClient();
      const errors: unknown[] = [];

      client.on("error", (e) => errors.push(e));

      const msg = createMessage("error", "server", "test-client", { message: "something wrong" });
      transport.emit("message", msg);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({ message: "something wrong" });
    });
  });

  describe("sendResult", () => {
    it("sendResult 发送 result 消息到 server", async () => {
      const { client, sent } = createMockClient();

      client.sendResult("task-1", true, "result-data");

      expect(sent).toHaveLength(1);
      const msg = sent[0] as any;
      expect(msg.type).toBe("result");
      expect(msg.payload).toEqual({
        taskId: "task-1",
        success: true,
        data: "result-data",
        error: undefined,
      });
    });
  });

  describe("queueLength / currentTask / taskQueue", () => {
    it("报告正确的队列状态", async () => {
      const { client, transport } = createMockClient();

      expect(client.queueLength).toBe(0);
      expect(client.currentTask).toBeNull();

      client.doing(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return "done";
      });

      dispatchTask(transport, makeTask({ id: "t1" }));
      dispatchTask(transport, makeTask({ id: "t2" }));
      dispatchTask(transport, makeTask({ id: "t3" }));

      await new Promise((r) => setTimeout(r, 10));

      expect(client.currentTask).not.toBeNull();
      expect(client.currentTask!.serverTask.id).toBe("t1");
      expect(client.queueLength).toBe(2);

      await new Promise((r) => setTimeout(r, 350));

      expect(client.queueLength).toBe(0);
      expect(client.currentTask).toBeNull();
    });
  });
});
