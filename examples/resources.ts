/**
 * 资源累积：serial 模式下 resources 随执行逐步增长
 *
 * 场景：三步流水线 — 每一步都能看到前面所有步骤的产出
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9003 });
  await server.start();

  const step1 = new Client({ id: "step-1", servers: ["ws://localhost:9003"] });
  const step2 = new Client({ id: "step-2", servers: ["ws://localhost:9003"] });
  const step3 = new Client({ id: "step-3", servers: ["ws://localhost:9003"] });
  const boss = new Client({ id: "boss", servers: ["ws://localhost:9003"] });

  step1.doing(async (ct) => {
    console.log(`[step-1] resources 数量: ${ct.serverTask.resources.length} (空，我是第一个)`);
    return { step: 1, output: "原始文本" };
  });

  step2.doing(async (ct) => {
    const prev = ct.serverTask.resources.find((r) => r.by === "step-1");
    console.log(`[step-2] 看到 step-1 的输出: ${JSON.stringify(prev?.data)}`);
    return { step: 2, output: "分词结果" };
  });

  step3.doing(async (ct) => {
    const r1 = ct.serverTask.resources.find((r) => r.by === "step-1");
    const r2 = ct.serverTask.resources.find((r) => r.by === "step-2");
    console.log(`[step-3] 看到 step-1: ${JSON.stringify(r1?.data)}`);
    console.log(`[step-3] 看到 step-2: ${JSON.stringify(r2?.data)}`);
    return { step: 3, output: "最终分析" };
  });

  await step1.connect();
  await step2.connect();
  await step3.connect();
  await boss.connect();
  await new Promise((r) => setTimeout(r, 200));

  server.on("task:completed", (task) => {
    console.log("\n=== 最终任务状态 ===");
    console.log(`resources 总数: ${task.resources.length}`);
    for (const res of task.resources) {
      console.log(`  ${res.by} → ${JSON.stringify(res.data)}`);
    }
  });

  boss.submit({
    content: "NLP 处理流水线",
    subscribe: ["step-1", "step-2", "step-3"],
    mode: "serial",
  });

  await new Promise((r) => setTimeout(r, 2000));

  boss.disconnect();
  step1.disconnect();
  step2.disconnect();
  step3.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
