/**
 * 串行模式：任务按 subscribe 顺序依次执行，后一个能看到前一个的结果
 *
 * 场景：数据处理管道 — collector 收集数据 → processor 处理数据
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9001 });
  await server.start();

  const collector = new Client({ id: "collector", servers: ["ws://localhost:9001"] });
  const processor = new Client({ id: "processor", servers: ["ws://localhost:9001"] });
  const boss = new Client({ id: "boss", servers: ["ws://localhost:9001"] });

  // collector: 收集原始数据
  collector.doing(async (clientTask) => {
    const task = clientTask.serverTask;
    console.log(`[collector] 收到任务: ${task.content}`);

    // 模拟收集数据
    const rawData = [10, 20, 30, 40, 50];
    console.log(`[collector] 收集到原始数据: ${rawData}`);
    return { rawData };
  });

  // processor: 拿到 collector 的结果继续处理
  processor.doing(async (clientTask) => {
    const task = clientTask.serverTask;
    console.log(`[processor] 收到任务: ${task.content}`);

    // serial 模式下，resources 里已经有 collector 的结果
    const collectorResult = task.resources.find((r) => r.by === "collector");
    if (collectorResult) {
      const data = (collectorResult.data as { rawData: number[] }).rawData;
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = sum / data.length;
      console.log(`[processor] collector 的数据: ${data}`);
      console.log(`[processor] 计算结果 — 总和: ${sum}, 平均: ${avg}`);
      return { sum, avg, count: data.length };
    }
    return { error: "没有上游数据" };
  });

  await collector.connect();
  await processor.connect();
  await boss.connect();
  await new Promise((r) => setTimeout(r, 200));

  // 监听完成
  server.on("task:completed", (task) => {
    console.log("\n[server] 任务完成！");
    console.log(`  资源链:`);
    for (const res of task.resources) {
      console.log(`    ${res.by}: ${JSON.stringify(res.data)}`);
    }
  });

  // 发起串行任务
  boss.submit({
    content: "数据采集与分析",
    subscribe: ["collector", "processor"],
    mode: "serial",
  });
  console.log("[boss] 已提交串行任务\n");

  await new Promise((r) => setTimeout(r, 2000));

  boss.disconnect();
  collector.disconnect();
  processor.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
