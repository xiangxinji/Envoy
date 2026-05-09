/**
 * 错误处理：worker 抛出异常时任务标记为 failed
 *
 * 场景：worker 执行失败，server 收到 failed 事件，boss 收到失败通知
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9005 });
  await server.start();

  const worker = new Client({ id: "worker", servers: ["ws://localhost:9005"] });
  const boss = new Client({ id: "boss", servers: ["ws://localhost:9005"] });

  // worker 故意抛出错误
  worker.doing(async (ct) => {
    const content = ct.serverTask.content;
    console.log(`[worker] 尝试执行: ${content}`);
    throw new Error("磁盘空间不足，无法写入文件");
  });

  await worker.connect();
  await boss.connect();
  await new Promise((r) => setTimeout(r, 200));

  // server 监听失败事件
  server.on("task:failed", (task) => {
    console.log(`[server] 任务失败: ${task.content}`);
    console.log(`[server] 失败原因:`, task.resources[0]?.data);
  });

  // boss 监听失败通知
  boss.on("task", (task) => {
    if (task.status === "failed") {
      console.log(`[boss] 收到失败通知: ${task.content}`);
      console.log(`[boss] resources:`, task.resources);
    }
  });

  // 空 subscribe 测试
  boss.on("error", (err) => {
    console.log(`[boss] 收到错误: ${(err as any).message}`);
  });

  // 测试 1: 正常提交（会失败）
  console.log("=== 测试 1: worker 抛出错误 ===\n");
  boss.submit({ content: "写入大文件", subscribe: ["worker"], mode: "serial" });

  await new Promise((r) => setTimeout(r, 1000));

  // 测试 2: 空 subscribe
  console.log("\n=== 测试 2: 空 subscribe ===\n");
  boss.submit({ content: "无效任务", subscribe: [], mode: "serial" });

  await new Promise((r) => setTimeout(r, 500));

  boss.disconnect();
  worker.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
