import { Server } from "../packages/server/index.js";
import { Client } from "../packages/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 任务重试示例
 *
 * 演示:
 * 1. 注册一个会失败的任务，设置 maxRetries
 * 2. 用计数器控制第 N 次执行成功
 * 3. 观察重试过程
 */
async function main() {
  const server = new Server({ port: 9003 });

  server.on("task:completed", (taskId: unknown, result: unknown) => {
    const r = result as { success: boolean; error?: string };
    console.log(`[Server] 任务 ${taskId}: success=${r.success}`);
    if (r.error) console.log(`[Server] 错误: ${r.error}`);
  });

  await server.start();
  console.log("[Server] 监听端口 9003");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9003"],
  });

  // 用计数器模拟第 3 次成功
  let attempt = 0;

  client.register("flaky-task", {
    description: "不稳定的任务",
    mode: "queue",
    priority: 1,
    maxRetries: 3,
    retryDelay: 500,
    execute: async (ctx) => {
      attempt++;
      console.log(`[Client] 第 ${attempt} 次尝试...`);
      await sleep(200);

      if (attempt < 3) {
        throw new Error(`模拟失败 (attempt ${attempt})`);
      }

      console.log("[Client] 执行成功!");
      return { attempt, result: "ok" };
    },
  });

  await client.connect();
  await sleep(500);

  console.log("\n--- 提交不稳定任务 (maxRetries=3) ---");
  const result = await server.executeAny("flaky-task", {});
  console.log("[Server] 最终结果:", result);

  await sleep(1000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
