import { Server } from "../packages/server/index.js";
import { Client } from "../packages/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 负载均衡示例
 *
 * 演示:
 * 1. 多个客户端注册相同能力
 * 2. 用 executeAny 提交多个任务
 * 3. 观察任务分配到不同客户端
 */
async function main() {
  const server = new Server({ port: 9007 });

  server.on("task:completed", (taskId: unknown, result: unknown) => {
    const r = result as { success: boolean; data?: unknown };
    console.log(`[Server] 任务完成: ${taskId}, data=`, r.data);
  });

  await server.start();
  console.log("[Server] 监听端口 9007");

  // 创建 3 个客户端，都注册相同能力
  const clients: Client[] = [];
  for (let i = 1; i <= 3; i++) {
    const client = new Client({
      id: `worker-${i}`,
      servers: ["ws://localhost:9007"],
    });

    client.register("compute", {
      description: "计算任务",
      mode: "queue",
      priority: 1,
      execute: async (ctx) => {
        const workerId = `worker-${i}`;
        console.log(`  [${workerId}] 开始计算: ${ctx.params.input}`);
        await sleep(500 + Math.random() * 500);
        console.log(`  [${workerId}] 计算完成`);
        return { worker: workerId, input: ctx.params.input };
      },
    });

    await client.connect();
    clients.push(client);
  }

  console.log("[Clients] 3 个 worker 已连接\n");
  await sleep(1000);

  // 提交多个任务，观察分配
  console.log("--- 提交 6 个任务 ---");
  const tasks = [];
  for (let i = 1; i <= 6; i++) {
    tasks.push(server.executeAny("compute", { input: `task-${i}` }));
  }

  const results = await Promise.all(tasks);
  console.log("\n--- 结果 ---");
  for (const r of results) {
    console.log(" ", r);
  }

  await sleep(1000);

  // 清理
  for (const c of clients) c.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
