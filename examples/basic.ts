/**
 * 基础示例：连接、doing 注册处理器、submit 发起任务
 *
 * 场景：boss 发起一个任务给 worker，worker 处理后返回结果
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  // 1. 启动 Server
  const server = new Server({ port: 9000 });
  await server.start();
  console.log("[server] 已启动 :9000");

  server.on("client:online", (client) => {
    console.log(`[server] 客户端上线: ${client.id}`);
  });

  // 2. 创建 Worker
  const worker = new Client({
    id: "worker-1",
    servers: ["ws://localhost:9000"],
  });

  // doing 注册处理器，收到的是 ClientTask
  worker.doing(async (clientTask) => {
    const task = clientTask.serverTask;
    console.log(`[worker-1] 收到任务: ${task.content}`);
    console.log(`[worker-1] 来自: ${task.createBy}`);
    return { message: `已处理: ${task.content}` };
  });

  await worker.connect();
  console.log("[worker-1] 已连接");

  // 3. 创建 Boss，发起任务
  const boss = new Client({
    id: "boss",
    servers: ["ws://localhost:9000"],
  });

  // 监听任务状态通知
  boss.on("task", (task) => {
    console.log(`[boss] 任务 ${task.id.substring(0, 15)}... 状态: ${task.status}`);
  });

  await boss.connect();
  console.log("[boss] 已连接");

  // 等待客户端上线
  await new Promise((r) => setTimeout(r, 200));

  // 4. 发起任务
  boss.submit({
    content: "编译前端项目",
    subscribe: ["worker-1"],
    mode: "serial",
  });
  console.log("[boss] 已提交任务");

  // 等待完成
  await new Promise((r) => setTimeout(r, 1000));

  // 5. 查看服务端任务状态
  const tasks = server.getAllTasks();
  for (const task of tasks) {
    console.log(`\n[server] 任务详情:`);
    console.log(`  ID: ${task.id}`);
    console.log(`  内容: ${task.content}`);
    console.log(`  状态: ${task.status}`);
    console.log(`  发起者: ${task.createBy}`);
    console.log(`  执行者: ${task.subscribe.join(", ")}`);
    console.log(`  资源:`, task.resources);
  }

  // 清理
  boss.disconnect();
  worker.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
