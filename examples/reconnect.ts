/**
 * 断线重连：client 断开后自动重连到 server
 *
 * 场景：server 重启后，client 自动重连并恢复工作
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  let server = new Server({ port: 9008 });
  await server.start();

  const worker = new Client({
    id: "worker",
    servers: ["ws://localhost:9008"],
    reconnect: true,
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
  });

  worker.on("connected", () => {
    console.log(`[worker] 已连接到 server`);
  });

  worker.on("disconnected", () => {
    console.log(`[worker] 与 server 断开连接`);
  });

  worker.on("reconnecting", (attempt) => {
    console.log(`[worker] 正在重连... 第 ${attempt} 次`);
  });

  server.on("client:online", (client) => {
    console.log(`[server] 客户端上线: ${client.id}`);
  });

  server.on("client:offline", (info) => {
    console.log(`[server] 客户端离线: ${info.id}`);
  });

  // === 阶段 1：正常连接 ===
  console.log("=== 阶段 1：正常连接 ===\n");
  await worker.connect();
  await new Promise((r) => setTimeout(r, 500));

  // === 阶段 2：server 关闭，触发重连 ===
  console.log("\n=== 阶段 2：server 关闭 ===\n");
  await server.stop();
  await new Promise((r) => setTimeout(r, 3000));

  // === 阶段 3：server 重启，client 自动重连成功 ===
  console.log("\n=== 阶段 3：server 重启 ===\n");
  server = new Server({ port: 9008 });
  await server.start();
  await new Promise((r) => setTimeout(r, 3000));

  worker.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
