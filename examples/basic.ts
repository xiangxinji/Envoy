import { Server } from "../packages/server/index.js";
import type { ClientState } from "../packages/server/index.js";
import { Client } from "../packages/client/index.js";
import type { CapabilityDefinition } from "../packages/core/capability.js";
import type { TaskProgress } from "../packages/core/task.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // 1. Start Server
  const server = new Server({ port: 9000 });
  await server.start();
  console.log("[Server] listening on :9000");

  server.on("client:online", (client: unknown) => {
    const c = client as ClientState | undefined;
    if (c) console.log(`[Server] client online: ${c.id}`);
  });

  server.on("client:registered", (clientId: unknown, caps: unknown) => {
    const id = clientId as string;
    const definitions = caps as CapabilityDefinition[];
    console.log(`[Server] client ${id} registered: ${definitions.map((c) => c.name).join(", ")}`);
  });

  server.on("task:progress", (taskId: unknown, progress: unknown) => {
    const id = taskId as string;
    const p = progress as TaskProgress;
    console.log(`[Server] task ${id} progress: ${p.step} (${p.progress}%)`);
  });

  // 2. Start Clients
  const clientA = new Client({
    id: "developer-a",
    servers: ["ws://localhost:9000"],
    heartbeatInterval: 3000,
  });

  const clientB = new Client({
    id: "developer-b",
    servers: ["ws://localhost:9000"],
    heartbeatInterval: 3000,
  });

  // Client A: can implement and test
  clientA.register("implement", {
    description: "实现需求",
    params: { requirement: { type: "string", required: true } },
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      console.log(`  [A] 开始实现: ${ctx.params.requirement}`);
      ctx.report({ step: "分析需求", progress: 0 });
      await sleep(300);
      ctx.report({ step: "编写代码", progress: 50 });
      await sleep(300);
      ctx.report({ step: "完成", progress: 100 });
      return { branch: "feature/xxx", files: 3 };
    },
  });

  clientA.register("test", {
    description: "测试",
    params: { target: { type: "string", required: true } },
    mode: "queue",
    priority: 2,
    execute: async (ctx) => {
      console.log(`  [A] 开始测试: ${ctx.params.target}`);
      await sleep(200);
      return { passed: 10, failed: 0 };
    },
  });

  // Client B: can implement and deploy
  clientB.register("implement", {
    description: "实现需求",
    params: { requirement: { type: "string", required: true } },
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      console.log(`  [B] 开始实现: ${ctx.params.requirement}`);
      ctx.report({ step: "分析需求", progress: 0 });
      await sleep(400);
      ctx.report({ step: "编写代码", progress: 60 });
      await sleep(200);
      ctx.report({ step: "完成", progress: 100 });
      return { branch: "feature/yyy", files: 5 };
    },
  });

  clientB.register("deploy", {
    description: "部署服务",
    params: { env: { type: "string", required: true } },
    mode: "queue",
    priority: 3,
    execute: async (ctx) => {
      console.log(`  [B] 开始部署到: ${ctx.params.env}`);
      ctx.report({ step: "打包", progress: 0 });
      await sleep(200);
      ctx.report({ step: "上传", progress: 50 });
      await sleep(200);
      ctx.report({ step: "重启", progress: 90 });
      await sleep(100);
      return { url: "https://app.example.com" };
    },
  });

  await clientA.connect();
  await clientB.connect();
  console.log("[Clients] connected");

  await sleep(1000);

  // 3. Server dispatches task to an idle client (auto-select)
  console.log("\n--- executeAny: implement ---");
  const result1 = await server.executeAny("implement", { requirement: "用户登录功能" });
  console.log("[Server] result:", result1);

  // 4. Server dispatches to specific client
  console.log("\n--- executeTo: deploy on developer-b ---");
  const result2 = await server.executeTo("developer-b", "deploy", { env: "production" });
  console.log("[Server] result:", result2);

  // 5. Client-to-Client via Server
  console.log("\n--- client-to-client: A calls test ---");
  const result3 = await clientA.execute("test", { target: "user-login" });
  console.log("[A] test result:", result3);

  // 6. Server pushes notification
  console.log("\n--- server notify ---");
  clientA.on("notify:announcement", (payload: unknown) => {
    console.log(`[A] received announcement:`, payload);
  });
  server.notify("developer-a", "announcement", { message: "下班前提交代码" });

  await sleep(1000);

  // 7. Check state
  console.log("\n--- server state ---");
  for (const c of server.getClients()) {
    console.log(`  ${c.id}: status=${c.status}, queue=${c.queueLength}`);
  }

  // Cleanup
  clientA.disconnect();
  clientB.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
