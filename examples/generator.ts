import { Server } from "../packages/server/index.js";
import { Client } from "../packages/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generator 执行模式示例
 *
 * 演示:
 * 1. 使用 Generator 函数注册 preemptive 能力
 * 2. yield 产生进度报告
 * 3. 高优先级任务抢占时 Generator 被中断
 */
async function main() {
  const server = new Server({ port: 9005 });

  server.on("task:completed", (taskId: unknown, result: unknown) => {
    const r = result as { success: boolean; data?: unknown };
    console.log(`[Server] 任务完成: ${taskId}, data=`, r.data);
  });

  server.on("task:progress", (taskId: unknown, progress: unknown) => {
    const p = progress as { step: string | number; progress: number };
    console.log(`[Server] 任务进度: ${taskId} - ${p.step} (${p.progress}%)`);
  });

  await server.start();
  console.log("[Server] 监听端口 9005");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9005"],
  });

  // Generator 执行模式 - 低优先级
  client.register("gen-low", {
    description: "Generator 低优先级任务",
    mode: "preemptive",
    priority: 1,
    execute: function* (ctx) {
      console.log("[Client] Generator 低优先级: 步骤 1");
      ctx.report({ step: "步骤1", progress: 20 });
      yield;

      console.log("[Client] Generator 低优先级: 步骤 2");
      ctx.report({ step: "步骤2", progress: 40 });
      yield;

      console.log("[Client] Generator 低优先级: 步骤 3");
      ctx.report({ step: "步骤3", progress: 60 });
      yield;

      console.log("[Client] Generator 低优先级: 步骤 4");
      ctx.report({ step: "步骤4", progress: 80 });
      yield;

      console.log("[Client] Generator 低优先级: 完成");
      ctx.report({ step: "完成", progress: 100 });
      return { type: "gen-low" };
    },
  });

  // Generator 执行模式 - 高优先级
  client.register("gen-high", {
    description: "Generator 高优先级任务",
    mode: "preemptive",
    priority: 10,
    execute: function* (ctx) {
      console.log("[Client] Generator 高优先级: 执行");
      ctx.report({ step: "处理", progress: 50 });
      yield;
      ctx.report({ step: "完成", progress: 100 });
      return { type: "gen-high" };
    },
  });

  await client.connect();
  await sleep(500);

  // 先提交低优先级，再提交高优先级
  console.log("\n--- 提交 Generator 低优先级任务 ---");
  const p1 = server.executeAny("gen-low", {});

  await sleep(600); // 等低优先级执行几步

  console.log("\n--- 提交 Generator 高优先级任务（将抢占） ---");
  const p2 = server.executeAny("gen-high", {});

  const [r1, r2] = await Promise.all([p1, p2]);
  console.log("\n[Server] 低优先级结果:", r1);
  console.log("[Server] 高优先级结果:", r2);

  await sleep(1000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
