/**
 * Team 基础示例：Leader / Member 加入团队，角色识别
 *
 * 场景：启动 Team 服务器，Leader 和 Member 分别加入，服务端识别角色
 */
import { Team } from "../packages/teams/team.js";
import { Leader } from "../packages/teams/leader.js";
import { Member } from "../packages/teams/member.js";

async function main() {
  // 1. 启动 Team 服务器
  const team = new Team({ port: 9010 });

  team.on("leader:joined", (clientId) => {
    console.log(`[team] Leader 已加入: ${clientId}`);
  });

  team.on("member:joined", (clientId) => {
    console.log(`[team] Member 已加入: ${clientId}`);
  });

  await team.start();
  console.log("[team] 服务器已启动 :9010");

  // 2. Leader 连接
  const leader = new Leader({
    id: "leader-1",
    servers: ["ws://localhost:9010"],
  });

  leader.on("task", (task) => {
    console.log(`[leader-1] 任务状态变更: ${task.status}`);
  });

  await leader.connect();
  console.log("[leader-1] 已连接");

  // 3. Member 连接
  const member1 = new Member({
    id: "member-1",
    servers: ["ws://localhost:9010"],
  });

  const member2 = new Member({
    id: "member-2",
    servers: ["ws://localhost:9010"],
  });

  await member1.connect();
  console.log("[member-1] 已连接");

  await member2.connect();
  console.log("[member-2] 已连接");

  // 等待消息处理
  await new Promise((r) => setTimeout(r, 500));

  // 清理
  leader.disconnect();
  member1.disconnect();
  member2.disconnect();
  await team.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
