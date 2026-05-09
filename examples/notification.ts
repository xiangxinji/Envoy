/**
 * 通知与消息：server notify 推送、client-to-client 消息
 *
 * 场景：server 向 client 推送告警通知，client 之间互相发消息
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9006 });
  await server.start();

  const dashboard = new Client({ id: "dashboard", servers: ["ws://localhost:9006"] });
  const agent = new Client({ id: "agent", servers: ["ws://localhost:9006"] });

  await dashboard.connect();
  await agent.connect();
  await new Promise((r) => setTimeout(r, 200));

  // === 1. Server 通知 ===
  console.log("=== Server 推送通知 ===\n");

  dashboard.on("message", (msg) => {
    console.log(`[dashboard] 收到通知: type=${msg.type}, subtype=${msg.subtype}`);
    console.log(`[dashboard] 内容:`, (msg as any).payload);
  });

  server.notify("dashboard", "alert", { level: "warning", message: "CPU 使用率超过 80%" });
  console.log("[server] 已推送告警通知");

  await new Promise((r) => setTimeout(r, 500));

  // === 2. Client 间消息 ===
  console.log("\n=== Client 间消息 ===\n");

  agent.on("message", (msg) => {
    if ((msg as any).subtype === "command") {
      console.log(`[agent] 收到指令:`, (msg as any).payload);
    }
  });

  dashboard.sendTo("agent", "command", { action: "restart", service: "nginx" });
  console.log("[dashboard] 已发送指令给 agent");

  await new Promise((r) => setTimeout(r, 500));

  // === 3. Client 向 server 发消息 ===
  console.log("\n=== Client 向 Server 发消息 ===\n");

  server.on("message", (clientId, msg) => {
    console.log(`[server] 收到 ${clientId} 的消息: subtype=${(msg as any).subtype}`);
    console.log(`[server] 内容:`, (msg as any).payload);
  });

  agent.send("report", { status: "healthy", uptime: 3600 });
  console.log("[agent] 已发送状态报告");

  await new Promise((r) => setTimeout(r, 500));

  dashboard.disconnect();
  agent.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
