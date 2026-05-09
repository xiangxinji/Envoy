/**
 * 并行模式：任务同时分发给所有 subscribe 客户端
 *
 * 场景：并发请求多个服务获取结果
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9002 });
  await server.start();

  const serviceA = new Client({ id: "service-a", servers: ["ws://localhost:9002"] });
  const serviceB = new Client({ id: "service-b", servers: ["ws://localhost:9002"] });
  const boss = new Client({ id: "boss", servers: ["ws://localhost:9002"] });

  serviceA.doing(async (clientTask) => {
    const task = clientTask.serverTask;
    console.log(`[service-a] 处理: ${task.content}`);
    await new Promise((r) => setTimeout(r, 300)); // 模拟耗时
    return { service: "A", result: "数据源A的结果" };
  });

  serviceB.doing(async (clientTask) => {
    const task = clientTask.serverTask;
    console.log(`[service-b] 处理: ${task.content}`);
    await new Promise((r) => setTimeout(r, 500)); // 模拟更长的耗时
    return { service: "B", result: "数据源B的结果" };
  });

  await serviceA.connect();
  await serviceB.connect();
  await boss.connect();
  await new Promise((r) => setTimeout(r, 200));

  server.on("task:completed", (task) => {
    console.log("\n[server] 并行任务完成！");
    console.log(`  资源:`);
    for (const res of task.resources) {
      console.log(`    ${res.by}: ${JSON.stringify(res.data)}`);
    }
  });

  boss.submit({
    content: "获取多源数据",
    subscribe: ["service-a", "service-b"],
    mode: "parallel",
  });
  console.log("[boss] 已提交并行任务\n");

  await new Promise((r) => setTimeout(r, 2000));

  boss.disconnect();
  serviceA.disconnect();
  serviceB.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
