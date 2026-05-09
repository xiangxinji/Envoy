import { Server } from "../packages/server/index.js";
import { Client } from "../packages/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 优先级队列示例
 *
 * 演示:
 * 1. 注册不同优先级的任务
 * 2. 同时提交多个任务
 * 3. 观察按优先级顺序执行
 */
async function main() {
  const server = new Server({ port: 9008 });

  const executionOrder: string[] = [];

  server.on("task:completed", (taskId: unknown, result: unknown) => {
    const r = result as { success: boolean; data?: { name: string } };
    if (r.data?.name) {
      executionOrder.push(r.data.name);
      console.log(`[Server] 完成: ${r.data.name} (顺序: ${executionOrder.join(" -> ")})`);
    }
  });

  await server.start();
  console.log("[Server] 监听端口 9008");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9008"],
  });

  // 注册不同优先级的任务
  const priorities = [
    { name: "low", priority: 1 },
    { name: "medium", priority: 5 },
    { name: "high", priority: 10 },
    { name: "critical", priority: 20 },
  ];

  for (const p of priorities) {
    client.register(`task-${p.name}`, {
      description: `${p.name} 优先级任务`,
      mode: "queue",
      priority: p.priority,
      execute: async () => {
        console.log(`  [Client] 执行 ${p.name} 任务`);
        await sleep(100);
        return { name: p.name, priority: p.priority };
      },
    });
  }

  await client.connect();
  await sleep(500);

  // 同时提交所有任务（打乱顺序）
  console.log("\n--- 同时提交 4 个不同优先级任务 ---");
  console.log("    提交顺序: low, critical, medium, high");

  const tasks = [
    server.executeAny("task-low", {}),
    server.executeAny("task-critical", {}),
    server.executeAny("task-medium", {}),
    server.executeAny("task-high", {}),
  ];

  await Promise.all(tasks);

  console.log("\n--- 最终执行顺序 ---");
  console.log("  ", executionOrder.join(" -> "));
  console.log("  (应该按优先级: critical -> high -> medium -> low)");

  await sleep(1000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
