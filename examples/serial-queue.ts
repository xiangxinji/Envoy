/**
 * Client 串行队列：同一个 worker 连续收到多个任务，逐个执行
 *
 * 场景：boss 连续提交 3 个任务给同一个 worker，worker 内部排队串行处理
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";
import type { ClientTask } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9004 });
  await server.start();

  const worker = new Client({ id: "worker", servers: ["ws://localhost:9004"] });
  const boss = new Client({ id: "boss", servers: ["ws://localhost:9004"] });

  const executionOrder: string[] = [];

  worker.doing(async (ct: ClientTask) => {
    const content = ct.serverTask.content;
    executionOrder.push(content);
    console.log(`[worker] 执行: ${content} | 队列剩余: ${worker.queueLength}`);
    await new Promise((r) => setTimeout(r, 200));
    return `完成-${content}`;
  });

  await worker.connect();
  await boss.connect();
  await new Promise((r) => setTimeout(r, 200));

  let completedCount = 0;
  server.on("task:completed", (task) => {
    completedCount++;
    console.log(`[server] 任务完成 #${completedCount}: ${task.resources[0]?.data}`);
  });

  // 连续提交 3 个任务
  console.log("[boss] 连续提交 3 个任务...\n");
  boss.submit({ content: "任务A", subscribe: ["worker"], mode: "serial" });
  boss.submit({ content: "任务B", subscribe: ["worker"], mode: "serial" });
  boss.submit({ content: "任务C", subscribe: ["worker"], mode: "serial" });

  // 等待全部完成
  await new Promise((r) => setTimeout(r, 2000));

  console.log(`\n执行顺序: ${executionOrder.join(" → ")}`);

  boss.disconnect();
  worker.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
