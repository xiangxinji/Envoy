import { Server } from "../packages/server/index.js";
import type { ClientState } from "../packages/server/index.js";
import { Client } from "../packages/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 断线重连示例
 *
 * 演示:
 * 1. 客户端正常连接
 * 2. 手动断开连接
 * 3. 观察自动重连
 * 4. 验证重连后能力重新注册
 */
async function main() {
  const server = new Server({ port: 9006 });

  server.on("client:online", (client: unknown) => {
    const c = client as ClientState;
    console.log(`[Server] 客户端上线: ${c.id}`);
  });

  server.on("client:offline", (info: unknown) => {
    const { id } = info as { id: string };
    console.log(`[Server] 客户端离线: ${id}`);
  });

  server.on("client:registered", (clientId: unknown, caps: unknown) => {
    console.log(`[Server] 客户端 ${clientId} 注册能力`);
  });

  await server.start();
  console.log("[Server] 监听端口 9006");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9006"],
    reconnect: true,
    reconnectInterval: 2000,
    maxReconnectAttempts: 5,
  });

  client.register("echo", {
    description: "回声任务",
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      return { echo: ctx.params };
    },
  });

  client.on("connected", () => {
    console.log("[Client] 已连接");
  });

  client.on("disconnected", () => {
    console.log("[Client] 已断开");
  });

  client.on("reconnecting", (attempt: unknown) => {
    console.log(`[Client] 正在重连 (attempt ${attempt})...`);
  });

  client.on("registered", () => {
    console.log("[Client] 能力注册成功");
  });

  await client.connect();
  await sleep(2000);

  // 正常断开
  console.log("\n--- 第一次断开 ---");
  client.disconnect();
  await sleep(5000); // 等待重连

  // 验证重连后可以执行任务
  console.log("\n--- 重连后执行任务 ---");
  try {
    const result = await server.executeAny("echo", { msg: "hello" });
    console.log("[Server] 结果:", result);
  } catch (err) {
    console.log("[Server] 执行失败:", (err as Error).message);
  }

  await sleep(1000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
