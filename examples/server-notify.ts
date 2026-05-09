/**
 * Server 定向推送示例：server.notify 向指定客户端发送通知
 *
 * 场景：监控中心检测到异常，通过 server.notify 向指定运维人员推送告警
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9020 });
  await server.start();
  console.log("[server] 已启动 :9020");

  // 1. 创建多个客户端
  const ops1 = new Client({ id: "ops-1", servers: ["ws://localhost:9020"] });
  const ops2 = new Client({ id: "ops-2", servers: ["ws://localhost:9020"] });

  // ops-1 监听通知
  ops1.on("notify", (msg) => {
    const { subtype } = msg;
    console.log(`[ops-1] 收到通知 [${subtype}]:`, msg.payload);
  });

  // ops-2 监听通知
  ops2.on("notify", (msg) => {
    const { subtype } = msg;
    console.log(`[ops-2] 收到通知 [${subtype}]:`, msg.payload);
  });

  await ops1.connect();
  await ops2.connect();
  await new Promise((r) => setTimeout(r, 200));
  console.log("[server] ops-1, ops-2 已上线");

  // 2. 向指定客户端推送
  console.log("\n--- 向 ops-1 推送告警 ---");
  server.notify("ops-1", "alert", { level: "critical", message: "数据库连接池耗尽" });

  await new Promise((r) => setTimeout(r, 300));

  // 3. 向另一个客户端推送
  console.log("\n--- 向 ops-2 推送告警 ---");
  server.notify("ops-2", "alert", { level: "warning", message: "磁盘空间不足 85%" });

  await new Promise((r) => setTimeout(r, 300));

  // 4. 向所有在线客户端广播
  console.log("\n--- 向所有人推送系统通知 ---");
  const onlineClients = server.getOnlineClients();
  for (const client of onlineClients) {
    server.notify(client.id, "system", { message: "系统将于 5 分钟后维护" });
  }

  await new Promise((r) => setTimeout(r, 500));

  ops1.disconnect();
  ops2.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
