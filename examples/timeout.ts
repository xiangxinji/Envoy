import { Server } from "../src/server/index.js";
import { Client } from "../src/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 任务超时示例
 *
 * 演示:
 * 1. 注册一个耗时较长的任务
 * 2. 设置较短的超时时间
 * 3. 观察任务超时失败
 */
async function main() {
  const server = new Server({
    port: 9002,
    defaultTaskTimeout: 3000, // 默认 3 秒超时
  });

  server.on("task:completed", (taskId: unknown, result: unknown) => {
    const r = result as { success: boolean; error?: string; duration: number };
    console.log(`[Server] 任务完成: ${taskId}, success=${r.success}, duration=${r.duration}ms`);
    if (r.error) console.log(`[Server] 错误: ${r.error}`);
  });

  await server.start();
  console.log("[Server] 监听端口 9002");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9002"],
  });

  // 注册一个需要 10 秒才能完成的任务
  client.register("slow-task", {
    description: "一个很慢的任务",
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      console.log("[Client] 开始执行慢任务...");
      for (let i = 0; i < 10; i++) {
        await sleep(1000);
        ctx.report({ step: `步骤 ${i + 1}/10`, progress: (i + 1) * 10 });
        console.log(`[Client] 进度: ${(i + 1) * 10}%`);
      }
      return { result: "完成" };
    },
  });

  await client.connect();
  await sleep(500);

  // 使用短超时提交任务
  console.log("\n--- 提交任务，超时 2 秒 ---");
  try {
    const result = await server.executeAny("slow-task", {}, { timeout: 2000 });
    console.log("[Server] 结果:", result);
  } catch (err) {
    console.log("[Server] 任务失败:", (err as Error).message);
  }

  await sleep(2000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
