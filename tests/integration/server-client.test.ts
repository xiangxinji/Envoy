import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Server } from "../../packages/server/server.js";
import { Client } from "../../packages/client/client.js";
import type { Task } from "../../packages/core/task.js";
import type { ClientTask } from "../../packages/client/client.js";
import { waitFor } from "../helpers/waitFor.js";

const PORT = 9100;

describe("Server + Client 集成测试", () => {
  let server: Server;
  let port: number;

  beforeEach(async () => {
    port = PORT + Math.floor(Math.random() * 100);
    server = new Server({ port, heartbeatTimeout: 60000 });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  function createClient(id: string): Client {
    const client = new Client({ id, servers: [`ws://localhost:${port}`], reconnect: false, heartbeatInterval: 60000 });
    client.reviewing(async (ct: ClientTask) => {
      client.review(ct.serverTask.id, true, "auto-approved");
    });
    return client;
  }

  it("客户端连接和断开触发 server 事件", async () => {
    const onlinePromise = waitFor(() => {
      const clients = server.getOnlineClients();
      return clients.find((c) => c.id === "c1");
    });

    const client = createClient("c1");
    await client.connect();

    const state = await onlinePromise;
    expect(state.id).toBe("c1");
    expect(state.status).toBe("online");

    const offlinePromise = new Promise<string>((resolve) => {
      server.on("client:offline", ({ id }) => resolve(id));
    });

    client.disconnect();
    const offlineId = await offlinePromise;
    expect(offlineId).toBe("c1");
  });

  it("serial 模式：任务串行执行并累积 resources", async () => {
    const worker1 = createClient("worker1");
    const worker2 = createClient("worker2");
    const boss = createClient("boss");

    worker1.doing(async (ct: ClientTask) => {
      const result = `w1-${ct.serverTask.content}`;
      worker1.sendResult(ct.serverTask.id, true, result);
      return result;
    });

    worker2.doing(async (ct: ClientTask) => {
      const result = `w2-${ct.serverTask.content}`;
      worker2.sendResult(ct.serverTask.id, true, result);
      return result;
    });

    await worker1.connect();
    await worker2.connect();
    await boss.connect();

    await waitFor(() => server.getOnlineClients().length >= 3 ? true : undefined);

    const completedTasks: Task[] = [];
    server.on("task:completed", (task) => completedTasks.push(task));

    boss.submit({
      content: "do-work",
      subscribe: ["worker1", "worker2"],
      mode: "serial",
    });

    const completed = await waitFor(() => completedTasks[0]);
    expect(completed.status).toBe("completed");
    expect(completed.createBy).toBe("boss");
    expect(completed.subscribe).toEqual(["worker1", "worker2"]);
    expect(completed.resources).toHaveLength(3); // 2 worker results + 1 leader review
    expect(completed.resources[0]).toEqual({ type: "client-result", by: "worker1", data: "w1-do-work", attempt: 1, timestamp: expect.any(Number) });
    expect(completed.resources[1]).toEqual({ type: "client-result", by: "worker2", data: "w2-do-work", attempt: 1, timestamp: expect.any(Number) });

    worker1.disconnect();
    worker2.disconnect();
    boss.disconnect();
  });

  it("parallel 模式：任务并行执行", async () => {
    const worker1 = createClient("p-worker1");
    const worker2 = createClient("p-worker2");
    const boss = createClient("p-boss");

    worker1.doing(async (ct: ClientTask) => {
      const result = `result-1-${ct.serverTask.content}`;
      worker1.sendResult(ct.serverTask.id, true, result);
      return result;
    });
    worker2.doing(async (ct: ClientTask) => {
      const result = `result-2-${ct.serverTask.content}`;
      worker2.sendResult(ct.serverTask.id, true, result);
      return result;
    });

    await worker1.connect();
    await worker2.connect();
    await boss.connect();

    await waitFor(() => server.getOnlineClients().length >= 3 ? true : undefined);

    const completedTasks: Task[] = [];
    server.on("task:completed", (task) => completedTasks.push(task));

    boss.submit({
      content: "parallel-work",
      subscribe: ["p-worker1", "p-worker2"],
      mode: "parallel",
    });

    const completed = await waitFor(() => completedTasks[0]);
    expect(completed.status).toBe("completed");
    // 2 worker results + 1 leader review
    expect(completed.resources).toHaveLength(3);

    const workerResults = completed.resources.filter((r) => r.type === "client-result");
    const bys = workerResults.map((r) => r.by).sort();
    expect(bys).toEqual(["p-worker1", "p-worker2"]);

    worker1.disconnect();
    worker2.disconnect();
    boss.disconnect();
  });

  it("subscribe 为空时返回错误", async () => {
    const boss = createClient("err-boss");
    const errors: unknown[] = [];
    boss.on("error", (e) => errors.push(e));
    await boss.connect();
    await waitFor(() => server.getOnlineClients().find((c) => c.id === "err-boss"));

    boss.submit({ content: "nope", subscribe: [], mode: "serial" });

    await waitFor(() => errors[0]);
    expect(errors[0]).toHaveProperty("message", "subscribe cannot be empty");

    boss.disconnect();
  });

  it("执行者抛出错误时任务标记为 failed", async () => {
    const worker = createClient("fail-worker");
    const boss = createClient("fail-boss");

    worker.doing(async (ct: ClientTask) => {
      worker.sendResult(ct.serverTask.id, false, undefined, "something broke");
      throw new Error("something broke");
    });

    await worker.connect();
    await boss.connect();
    await waitFor(() => server.getOnlineClients().length >= 2 ? true : undefined);

    const failedTasks: Task[] = [];
    server.on("task:failed", (task) => failedTasks.push(task));

    boss.submit({
      content: "will-fail",
      subscribe: ["fail-worker"],
      mode: "serial",
    });

    const failed = await waitFor(() => failedTasks[0]);
    expect(failed.status).toBe("failed");
    expect(failed.resources[0].data).toEqual({ error: "something broke" });

    worker.disconnect();
    boss.disconnect();
  });

  it("发起者收到 task 状态通知", async () => {
    const worker = createClient("notif-worker");
    const boss = createClient("notif-boss");

    worker.doing(async (ct: ClientTask) => {
      const result = `done-${ct.serverTask.content}`;
      worker.sendResult(ct.serverTask.id, true, result);
      return result;
    });

    await worker.connect();
    await boss.connect();
    await waitFor(() => server.getOnlineClients().length >= 2 ? true : undefined);

    const taskNotifications: Task[] = [];
    boss.on("task", (task) => taskNotifications.push(task));

    boss.submit({
      content: "notify-test",
      subscribe: ["notif-worker"],
      mode: "serial",
    });

    await waitFor(() => taskNotifications.find((t) => t.status === "completed"));

    const statuses = taskNotifications.map((t) => t.status);
    expect(statuses).toContain("pending");
    expect(statuses).toContain("reviewing");
    expect(statuses).toContain("completed");

    worker.disconnect();
    boss.disconnect();
  });

  it("server notify 推送通知到客户端", async () => {
    const client = createClient("notif-client");
    const received: unknown[] = [];
    client.on("message", (msg) => received.push(msg));
    await client.connect();
    await waitFor(() => server.getOnlineClients().find((c) => c.id === "notif-client"));

    server.notify("notif-client", "alert", { level: "warning" });

    await waitFor(() => received[0]);
    expect(received[0]).toHaveProperty("subtype", "alert");

    client.disconnect();
  });

  it("客户端串行队列：多个任务排队执行", async () => {
    const worker = createClient("queue-worker");
    const boss = createClient("queue-boss");
    const executionOrder: string[] = [];

    worker.doing(async (ct: ClientTask) => {
      executionOrder.push(ct.serverTask.content);
      await new Promise((r) => setTimeout(r, 50));
      worker.sendResult(ct.serverTask.id, true, `done-${ct.serverTask.content}`);
      return `done-${ct.serverTask.content}`;
    });

    await worker.connect();
    await boss.connect();
    await waitFor(() => server.getOnlineClients().length >= 2 ? server : undefined);

    const completedTasks: Task[] = [];
    server.on("task:completed", (task) => completedTasks.push(task));

    boss.submit({ content: "first", subscribe: ["queue-worker"], mode: "serial" });
    boss.submit({ content: "second", subscribe: ["queue-worker"], mode: "serial" });
    boss.submit({ content: "third", subscribe: ["queue-worker"], mode: "serial" });

    await waitFor(() => completedTasks.length >= 3 ? completedTasks : undefined, 8000);

    expect(executionOrder).toEqual(["first", "second", "third"]);

    worker.disconnect();
    boss.disconnect();
  });

  it("client-to-client 消息转发", async () => {
    const clientA = createClient("msg-a");
    const clientB = createClient("msg-b");
    const received: unknown[] = [];

    clientB.on("message", (msg) => received.push(msg));

    await clientA.connect();
    await clientB.connect();
    await waitFor(() => server.getOnlineClients().length >= 2 ? true : undefined);

    clientA.sendTo("msg-b", "direct", { text: "hello B" });

    await waitFor(() => received[0]);
    expect(received[0]).toHaveProperty("subtype", "direct");

    clientA.disconnect();
    clientB.disconnect();
  });

  it("doing 收到的是 ClientTask，包含 serverTask 引用", async () => {
    const worker = createClient("ct-worker");
    const boss = createClient("ct-boss");
    let receivedCT: ClientTask | null = null;

    worker.doing(async (ct: ClientTask) => {
      receivedCT = ct;
      worker.sendResult(ct.serverTask.id, true, "ok");
      return "ok";
    });

    await worker.connect();
    await boss.connect();
    await waitFor(() => server.getOnlineClients().length >= 2 ? server : undefined);

    const completedTasks: Task[] = [];
    server.on("task:completed", (task) => completedTasks.push(task));

    boss.submit({ content: "check-client-task", subscribe: ["ct-worker"], mode: "serial" });

    await waitFor(() => completedTasks[0]);

    expect(receivedCT).not.toBeNull();
    expect(receivedCT!.serverTask.content).toBe("check-client-task");
    expect(receivedCT!.serverTask.createBy).toBe("ct-boss");
    expect(receivedCT!.result).toBe("ok");
    expect(receivedCT!.startedAt).toBeTypeOf("number");
    expect(receivedCT!.completedAt).toBeTypeOf("number");
    expect(receivedCT!.id).toMatch(/^ct-/);

    worker.disconnect();
    boss.disconnect();
  });

  it("doing 延迟注册也能处理已排队的任务", async () => {
    const worker = createClient("delayed-worker");
    const boss = createClient("delayed-boss");

    await worker.connect();
    await boss.connect();
    await waitFor(() => server.getOnlineClients().length >= 2 ? server : undefined);

    const completedTasks: Task[] = [];
    server.on("task:completed", (task) => completedTasks.push(task));

    // 先提交任务（此时 worker 还没 doing）
    boss.submit({ content: "delayed-task", subscribe: ["delayed-worker"], mode: "serial" });

    // 等任务到达 worker（没有 doing，任务会在队列里等）
    await new Promise((r) => setTimeout(r, 200));

    // 注册 doing，应该立即处理排队的任务
    worker.doing(async (ct: ClientTask) => {
      const result = `delayed-${ct.serverTask.content}`;
      worker.sendResult(ct.serverTask.id, true, result);
      return result;
    });

    await waitFor(() => completedTasks[0]);
    expect(completedTasks[0].status).toBe("completed");
    const workerResult = completedTasks[0].resources.find((r) => r.type === "client-result");
    expect(workerResult!.data).toBe("delayed-delayed-task");

    worker.disconnect();
    boss.disconnect();
  });
});
