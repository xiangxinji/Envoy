/**
 * Team 任务分发示例：Leader 向 Member 分发任务
 *
 * 场景：Leader 提交任务，Member 注册处理器执行任务，Leader 接收结果
 */
import { Team } from "../packages/teams/team.js";
import { Leader } from "../packages/teams/leader.js";
import { Member } from "../packages/teams/member.js";

async function main() {
  // 1. 启动 Team 服务器
  const team = new Team({ port: 9011 });

  team.on("leader:joined", (clientId) => {
    console.log(`[team] Leader 上线: ${clientId}`);
  });
  team.on("member:joined", (clientId) => {
    console.log(`[team] Member 上线: ${clientId}`);
  });

  await team.start();
  console.log("[team] 服务器已启动 :9011");

  // 2. Member 注册处理器
  const member = new Member({
    id: "worker",
    servers: ["ws://localhost:9011"],
  });

  member.doing(async (clientTask) => {
    const task = clientTask.serverTask;
    console.log(`[worker] 收到任务: ${task.content}`);
    // 模拟处理
    await new Promise((r) => setTimeout(r, 300));
    return { result: `完成: ${task.content}` };
  });

  await member.connect();
  console.log("[worker] 已连接并注册处理器");

  // 3. Leader 连接并提交任务
  const leader = new Leader({
    id: "manager",
    servers: ["ws://localhost:9011"],
  });

  leader.on("task", (task) => {
    console.log(`[manager] 任务状态: ${task.status}`);
    if (task.status === "completed") {
      console.log(`[manager] 任务结果:`, task.resources);
    }
  });

  await leader.connect();
  console.log("[manager] 已连接");

  // 等待客户端上线
  await new Promise((r) => setTimeout(r, 300));

  // 4. Leader 提交两个任务
  leader.submit({
    content: "编译前端项目",
    subscribe: ["worker"],
    mode: "serial",
  });

  leader.submit({
    content: "运行单元测试",
    subscribe: ["worker"],
    mode: "serial",
  });

  console.log("[manager] 已提交 2 个任务");

  // 等待任务完成
  await new Promise((r) => setTimeout(r, 2000));

  // 5. 查看服务端任务状态
  const tasks = team.innerServer.getAllTasks();
  console.log(`\n[team] 共处理 ${tasks.length} 个任务:`);
  for (const task of tasks) {
    console.log(`  - ${task.content}: ${task.status}`);
  }

  // 清理
  leader.disconnect();
  member.disconnect();
  await team.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
