/**
 * Team 消息通信示例：Leader 与 Member 之间的双向消息
 *
 * 场景：Leader 通过 sendTo 向 Member 发送指令，Member 收到后回复结果
 */
import { Team } from "../packages/teams/team.js";
import { Leader } from "../packages/teams/leader.js";
import { Member } from "../packages/teams/member.js";

async function main() {
  // 1. 启动 Team 服务器
  const team = new Team({ port: 9012 });
  await team.start();
  console.log("[team] 服务器已启动 :9012");

  // 2. Member 连接，监听来自 Leader 的消息
  const member = new Member({
    id: "member-1",
    servers: ["ws://localhost:9012"],
  });

  member.on("message", (msg) => {
    if (msg.subtype === "command") {
      const { action } = msg.payload as { action: string };
      console.log(`[member-1] 收到指令: ${action}`);

      // 回复 Leader
      member.sendTo("leader-1", "reply", {
        action,
        status: "done",
        timestamp: Date.now(),
      });
      console.log(`[member-1] 已回复 leader-1`);
    }
  });

  await member.connect();
  console.log("[member-1] 已连接");

  // 3. Leader 连接，发送指令并接收回复
  const leader = new Leader({
    id: "leader-1",
    servers: ["ws://localhost:9012"],
  });

  leader.on("message", (msg) => {
    if (msg.subtype === "reply") {
      const data = msg.payload as { action: string; status: string };
      console.log(`[leader-1] 收到回复: ${data.action} -> ${data.status}`);
    }
  });

  await leader.connect();
  console.log("[leader-1] 已连接");

  await new Promise((r) => setTimeout(r, 300));

  // 4. Leader 向 Member 发送多条指令
  leader.sendTo("member-1", "command", { action: "查询数据库" });
  console.log("[leader-1] 已发送指令: 查询数据库");

  await new Promise((r) => setTimeout(r, 500));

  leader.sendTo("member-1", "command", { action: "生成报告" });
  console.log("[leader-1] 已发送指令: 生成报告");

  await new Promise((r) => setTimeout(r, 1000));

  // 5. Leader 向 Server 发消息
  team.innerServer.on("message", (clientId, msg) => {
    if (msg.subtype === "status-report") {
      console.log(`[team] 收到 ${clientId} 状态报告:`, msg.payload);
    }
  });

  leader.send("status-report", { progress: 100, tasks: 2 });
  console.log("[leader-1] 已发送状态报告给服务器");

  await new Promise((r) => setTimeout(r, 500));

  // 清理
  leader.disconnect();
  member.disconnect();
  await team.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
