import { Server } from "../src/server/index.js";
import { Client } from "../src/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 任务抢占示例
 *
 * 演示:
 * 1. 注册低优先级任务（耗时长）
 * 2. 注册高优先级任务
 * 3. 先提交低优先级任务，再提交高优先级任务
 * 4. 观察高优先级任务抢占低优先级任务
 */
async function main() {
  const server = new Server({ port: 9004 });

  server.on("task:completed", (taskId: unknown, result: unknown) => {
    const r = result as { success: boolean; data?: unknown };
    console.log(`[Server] 任务完成: ${taskId}, data=`, r.data);
  });

  await server.start();
  console.log("[Server] 监听端口 9004");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9004"],
  });

  // 低优先级任务，耗时较长
  client.register("low-priority", {
    description: "低优先级任务",
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      console.log("[Client] 开始执行低优先级任务");
      for (let i = 0; i < 5; i++) {
        await sleep(500);
        ctx.report({ step: `步骤 ${i + 1}`, progress: (i + 1) * 20 });
        console.log(`[Client] 低优先级进度: ${(i + 1) * 20}%`);
      }
      return { type: "low" };
    },
  });

  // 高优先级任务
  client.register("high-priority", {
    description: "高优先级任务",
    mode: "queue",
    priority: 10,
    execute: async (ctx) => {
      console.log("[Client] 开始执行高优先级任务");
      await sleep(300);
      ctx.report({ step: "处理", progress: 50 });
      await sleep(300);
      ctx.report({ step: "完成", progress: 100 });
      return { type: "high" };
    },
  });

  await client.connect();
  await sleep(500);

  // 同时提交两个任务
  console.log("\n--- 同时提交低优先级和高优先级任务 ---");
  const p1 = server.executeAny("low-priority", {});
  const p2 = server.executeAny("high-priority", {});

  const [r1, r2] = await Promise.all([p1, p2]);
  console.log("[Server] 低优先级结果:", r1);
  console.log("[Server] 高优先级结果:", r2);

  await sleep(1000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
