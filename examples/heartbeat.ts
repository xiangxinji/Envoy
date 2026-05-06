import { Server } from "../src/server/index.js";
import type { ClientState } from "../src/server/index.js";
import { Client } from "../src/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 心跳检测示例
 *
 * 演示:
 * 1. 客户端定期发送心跳
 * 2. 服务端通过心跳超时检测客户端离线
 */
async function main() {
  // 设置较短的心跳超时便于观察
  const server = new Server({
    port: 9001,
    heartbeatTimeout: 5000,
  });

  server.on("client:online", (client: unknown) => {
    const c = client as ClientState;
    console.log(`[Server] 客户端上线: ${c.id}`);
  });

  server.on("client:offline", (info: unknown) => {
    const { id } = info as { id: string };
    console.log(`[Server] 客户端离线: ${id}`);
  });

  await server.start();
  console.log("[Server] 监听端口 9001");

  // 创建客户端，设置 2 秒心跳间隔
  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9001"],
    heartbeatInterval: 2000,
  });

  client.on("connected", () => {
    console.log("[Client] 已连接");
  });

  await client.connect();
  console.log("[Client] 开始发送心跳...");

  // 等待 6 秒，观察心跳
  await sleep(6000);

  // 模拟异常断开（直接关闭底层连接，不走正常 disconnect）
  console.log("\n[Client] 模拟异常断开...");
  (client as any).transport.ws.close();

  // 等待服务端检测到离线（heartbeatTimeout = 5s）
  console.log("[Server] 等待心跳超时...");
  await sleep(8000);

  // 清理
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
