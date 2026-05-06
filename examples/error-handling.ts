import { Server } from "../src/server/index.js";
import { Client } from "../src/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 错误处理示例
 *
 * 演示:
 * 1. 任务执行抛出异常
 * 2. 任务超时
 * 3. 执行不存在的能力
 * 4. 各种错误类型的处理
 */
async function main() {
  const server = new Server({
    port: 9009,
    defaultTaskTimeout: 3000,
  });

  await server.start();
  console.log("[Server] 监听端口 9009");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9009"],
  });

  // 正常任务
  client.register("normal", {
    description: "正常任务",
    mode: "queue",
    priority: 1,
    execute: async () => {
      return { status: "ok" };
    },
  });

  // 会抛异常的任务
  client.register("throw-error", {
    description: "抛出异常的任务",
    mode: "queue",
    priority: 1,
    execute: async () => {
      throw new Error("任务执行失败");
    },
  });

  // 耗时任务（用于测试超时）
  client.register("slow", {
    description: "耗时任务",
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      await sleep(10000);
      return { status: "done" };
    },
  });

  await client.connect();
  await sleep(500);

  // 测试 1: 正常任务
  console.log("\n--- 测试 1: 正常任务 ---");
  try {
    const r = await server.executeAny("normal", {});
    console.log("[Server] 成功:", r);
  } catch (err) {
    console.log("[Server] 失败:", (err as Error).message);
  }

  // 测试 2: 任务抛异常
  console.log("\n--- 测试 2: 任务抛异常 ---");
  try {
    const r = await server.executeAny("throw-error", {});
    console.log("[Server] 成功:", r);
  } catch (err) {
    console.log("[Server] 失败:", (err as Error).message);
  }

  // 测试 3: 任务超时
  console.log("\n--- 测试 3: 任务超时 (timeout=1000ms) ---");
  try {
    const r = await server.executeAny("slow", {}, { timeout: 1000 });
    console.log("[Server] 成功:", r);
  } catch (err) {
    console.log("[Server] 失败:", (err as Error).message);
  }

  // 测试 4: 执行不存在的能力
  console.log("\n--- 测试 4: 执行不存在的能力 ---");
  try {
    const r = await server.executeAny("nonexistent", {});
    console.log("[Server] 成功:", r);
  } catch (err) {
    console.log("[Server] 失败:", (err as Error).message);
  }

  await sleep(2000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
