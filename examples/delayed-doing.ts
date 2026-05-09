/**
 * 延迟 doing：任务在 doing 注册前就已到达，注册后自动执行
 *
 * 场景：worker 先连接并收到 dispatch，然后才注册 doing handler
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9009 });
  await server.start();

  const worker = new Client({ id: "worker", servers: ["ws://localhost:9009"] });
  const boss = new Client({ id: "boss", servers: ["ws://localhost:9009"] });

  await worker.connect();
  await boss.connect();
  await new Promise((r) => setTimeout(r, 200));

  // boss 先提交任务，此时 worker 还没有注册 doing
  console.log("[boss] 提交任务（worker 尚未注册 doing）\n");
  boss.submit({ content: "延迟执行的任务", subscribe: ["worker"], mode: "serial" });

  // 等待 dispatch 到达 worker
  await new Promise((r) => setTimeout(r, 500));

  console.log(`[worker] 当前队列长度: ${worker.queueLength}`);
  console.log(`[worker] 当前任务: ${worker.currentTask?.id ?? "(无)"}`);

  // server 监听完成
  server.on("task:completed", (task) => {
    console.log(`\n[server] 任务完成: ${task.content}`);
    console.log(`[server] 结果:`, task.resources[0]?.data);
  });

  // 延迟注册 doing — 此时应立即处理队列中的任务
  console.log("\n[worker] 注册 doing handler...\n");
  worker.doing(async (ct) => {
    console.log(`[worker] 执行: ${ct.serverTask.content}`);
    console.log(`[worker] ClientTask ID: ${ct.id}`);
    return `已完成: ${ct.serverTask.content}`;
  });

  await new Promise((r) => setTimeout(r, 1000));

  boss.disconnect();
  worker.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
