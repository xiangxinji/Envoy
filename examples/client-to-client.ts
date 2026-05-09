import { Server } from "../packages/server/index.js";
import { Client } from "../packages/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 客户端间通信示例
 *
 * 演示:
 * 1. 客户端 A 注册能力，客户端 B 通过 execute 调用 A 的能力
 * 2. 客户端间通过 sendTo 发送简单消息（fire-and-forget）
 */
async function main() {
  const server = new Server({ port: 9011 });

  server.on("task:completed", (taskId: unknown, result: unknown) => {
    const r = result as { success: boolean; data?: unknown };
    console.log(`[Server] 任务完成: ${taskId}`, r.data);
  });

  await server.start();
  console.log("[Server] 监听端口 9011");

  // 客户端 A: 提供计算能力
  const clientA = new Client({
    id: "calculator",
    servers: ["ws://localhost:9011"],
  });

  clientA.register("add", {
    description: "加法运算",
    params: {
      a: { type: "number", required: true },
      b: { type: "number", required: true },
    },
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      const { a, b } = ctx.params as { a: number; b: number };
      console.log(`  [Calculator] 计算 ${a} + ${b}`);
      await sleep(100);
      return { result: a + b };
    },
  });

  clientA.register("multiply", {
    description: "乘法运算",
    params: {
      a: { type: "number", required: true },
      b: { type: "number", required: true },
    },
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      const { a, b } = ctx.params as { a: number; b: number };
      console.log(`  [Calculator] 计算 ${a} * ${b}`);
      await sleep(100);
      return { result: a * b };
    },
  });

  // 客户端 B: 调用 A 的能力
  const clientB = new Client({
    id: "requester",
    servers: ["ws://localhost:9011"],
  });

  // A 监听来自其他客户端的消息
  clientA.on("message:greeting", (payload) => {
    console.log("[Calculator] 收到消息:", payload);
  });

  await clientA.connect();
  await clientB.connect();
  console.log("[Clients] 已连接\n");
  await sleep(1000);

  // B 调用 A 的 add 能力
  console.log("--- 客户端 B 调用 add ---");
  const r1 = await clientB.execute("add", { a: 10, b: 20 });
  console.log("[B] 结果:", r1);

  // B 调用 A 的 multiply 能力
  console.log("\n--- 客户端 B 调用 multiply ---");
  const r2 = await clientB.execute("multiply", { a: 6, b: 7 });
  console.log("[B] 结果:", r2);

  // 链式调用: B 调用 add，然后用结果调用 multiply
  console.log("\n--- 链式调用 ---");
  const addResult = await clientB.execute("add", { a: 3, b: 4 }) as { result: number };
  const mulResult = await clientB.execute("multiply", { a: addResult.result, b: 2 }) as { result: number };
  console.log(`[B] (3 + 4) * 2 = ${mulResult.result}`);

  // B 向 A 发送简单消息（fire-and-forget）
  console.log("\n--- 客户端间消息 ---");
  clientB.sendTo("calculator", "greeting", { text: "你好，我是 requester！" });
  console.log("[B] 已发送消息给 calculator");

  await sleep(1000);

  // 清理
  clientA.disconnect();
  clientB.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
