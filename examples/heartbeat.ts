/**
 * 心跳检测：server 监控 client 心跳，超时自动标记离线
 *
 * 场景：设置较短的心跳间隔和超时时间，观察 server 检测到 client 离线
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({
    port: 9007,
    heartbeatTimeout: 3000, // 3 秒无心跳则超时
  });
  await server.start();

  const worker = new Client({
    id: "worker",
    servers: ["ws://localhost:9007"],
    heartbeatInterval: 1000, // 每 1 秒发一次心跳
  });

  // server 监听上下线事件
  server.on("client:online", (client) => {
    console.log(`[server] 客户端上线: ${client.id}`);
  });

  server.on("client:offline", (info) => {
    console.log(`[server] 客户端离线: ${info.id}`);
  });

  await worker.connect();
  await new Promise((r) => setTimeout(r, 200));

  console.log("[worker] 已连接，心跳正常运行中...\n");

  // 正常运行 2 秒
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`[server] 在线客户端: ${server.getOnlineClients().map((c) => c.id).join(", ")}`);

  // 模拟网络断开（不发送 close 帧，让 server 靠心跳超时检测）
  console.log("\n[worker] 模拟网络断开（停止心跳，不主动关闭连接）...");
  (worker as any).heartbeat.stop();
  // 同时停止 transport 的重连
  (worker as any).transport.options.reconnect = false;

  // 等待 server 心跳超时检测
  console.log("[server] 等待心跳超时检测...\n");
  await new Promise((r) => setTimeout(r, 5000));

  console.log(`[server] 在线客户端: ${server.getOnlineClients().map((c) => c.id).join(", ") || "(无)"}`);

  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
