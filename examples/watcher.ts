/**
 * 监控者：WatcherClient 自动接收所有任务生命周期事件和客户端上下线通知
 *
 * 场景：monitor 以 WatcherClient 身份旁观 boss→worker 的任务流程，无需手动订阅
 *
 * 说明：WatcherClient 连接时自带 role=watcher，server 自动推送：
 *   - 所有任务的创建/更新/完成/失败事件
 *   - 所有客户端的上下线事件
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";
import { WatcherClient } from "../packages/client/watcher-client.js";

async function main() {
  const server = new Server({ port: 9010 });
  await server.start();

  const worker = new Client({ id: "worker", servers: ["ws://localhost:9010"] });
  const boss = new Client({ id: "boss", servers: ["ws://localhost:9010"] });
  const monitor = new WatcherClient({ id: "monitor", servers: ["ws://localhost:9010"] });

  // monitor 监听所有事件（框架自动推送，无需手动注册）
  monitor.on("client:online", (state) => {
    console.log(`[monitor] 客户端上线: ${state.id}`);
  });

  monitor.on("client:offline", (info) => {
    console.log(`[monitor] 客户端离线: ${info.id}`);
  });

  monitor.on("task:created", (task) => {
    console.log(`[monitor] 任务创建: ${task.content} (by ${task.createBy})`);
  });

  monitor.on("task:updated", (task) => {
    console.log(`[monitor] 任务更新: ${task.content} → ${task.status}`);
  });

  monitor.on("task:completed", (task) => {
    console.log(`[monitor] 任务完成: ${task.content}`);
    for (const res of task.resources) {
      console.log(`[monitor]   ${res.by}: ${JSON.stringify(res.data)}`);
    }
  });

  monitor.on("task:failed", (task) => {
    console.log(`[monitor] 任务失败: ${task.content}`);
  });

  worker.doing(async (ct) => {
    console.log(`[worker] 执行: ${ct.serverTask.content}`);
    await new Promise((r) => setTimeout(r, 300));
    return { done: true };
  });

  // monitor 先连接，后续能观察到所有客户端的上下线
  await monitor.connect();
  await worker.connect();
  await boss.connect();
  await new Promise((r) => setTimeout(r, 300));

  // boss 提交任务，monitor 作为旁观者自动收到所有事件
  console.log("=== boss 提交任务给 worker ===\n");
  boss.submit({ content: "部署服务", subscribe: ["worker"], mode: "serial" });

  await new Promise((r) => setTimeout(r, 1500));

  console.log("\n=== worker 断开 ===\n");
  worker.disconnect();

  await new Promise((r) => setTimeout(r, 500));

  boss.disconnect();
  monitor.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
