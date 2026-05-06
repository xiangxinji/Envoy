import { Server } from "../src/server/index.js";
import { Client } from "../src/client/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 通知机制示例
 *
 * 演示:
 * 1. 服务端推送多种类型通知
 * 2. 客户端监听 notify 和 notify:<subtype> 事件
 * 3. 双向消息通信
 */
async function main() {
  const server = new Server({ port: 9010 });

  await server.start();
  console.log("[Server] 监听端口 9010");

  const client = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9010"],
  });

  // 监听所有通知
  client.on("notify", (msg: unknown) => {
    const m = msg as { subtype: string; payload: unknown };
    console.log(`[Client] 收到通知: subtype=${m.subtype}`, m.payload);
  });

  // 监听特定类型通知
  client.on("notify:alert", (payload: unknown) => {
    console.log(`[Client] 收到告警:`, payload);
  });

  client.on("notify:update", (payload: unknown) => {
    console.log(`[Client] 收到更新:`, payload);
  });

  client.on("notify:announcement", (payload: unknown) => {
    console.log(`[Client] 收到公告:`, payload);
  });

  // 监听服务端消息
  server.on("message", (clientId: unknown, msg: unknown) => {
    const m = msg as { subtype: string; payload: unknown };
    console.log(`[Server] 收到客户端 ${clientId} 的消息:`, m);
  });

  await client.connect();
  await sleep(1000);

  // 发送不同类型通知
  console.log("\n--- 发送告警通知 ---");
  server.notify("worker-1", "alert", { level: "warning", message: "CPU 使用率过高" });

  await sleep(500);

  console.log("\n--- 发送更新通知 ---");
  server.notify("worker-1", "update", { version: "1.2.0", changelog: "修复 bug" });

  await sleep(500);

  console.log("\n--- 发送公告 ---");
  server.notify("worker-1", "announcement", { message: "系统将于今晚维护" });

  await sleep(500);

  // 客户端发送消息给服务端
  console.log("\n--- 客户端发送消息 ---");
  client.send("status", { cpu: 45, memory: 60 });

  await sleep(1000);

  // 清理
  client.disconnect();
  await server.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
