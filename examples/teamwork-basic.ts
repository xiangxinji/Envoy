import { Team } from "../src/teamwork/index.js";
import { Leader } from "../src/teamwork/index.js";
import { Member } from "../src/teamwork/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // ============================================================
  // 第一部分：启动 Team
  // ============================================================
  const team = new Team({ port: 9500, resourceRoot: "./example-resources" });
  await team.start();
  console.log("[Team] listening on :9500");

  team.on("leader:joined", (id) => console.log(`[Team] leader joined: ${id}`));
  team.on("member:joined", (id) => console.log(`[Team] member joined: ${id}`));
  team.on("resource:changed", (event) => console.log(`[Team] resource ${event.action}: ${event.path}`));

  // ============================================================
  // 第二部分：启动 Leader 和 Members
  // ============================================================
  const leader = new Leader({ id: "lead-1", servers: ["ws://localhost:9500"] });

  const memberA = new Member({ id: "member-a", servers: ["ws://localhost:9500"] });
  const memberB = new Member({ id: "member-b", servers: ["ws://localhost:9500"] });

  // Member A 注册能力: 数据提取
  memberA.register("extract-data", {
    description: "从数据源提取数据",
    params: { source: { type: "string", required: true } },
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      console.log(`  [Member A] extracting from: ${ctx.params.source}`);
      ctx.report({ step: "connecting", progress: 30 });
      await sleep(300);
      ctx.report({ step: "reading", progress: 70 });
      await sleep(200);
      ctx.report({ step: "done", progress: 100 });
      return { records: 150, format: "json" };
    },
  });

  // Member A 注册能力: 数据加载
  memberA.register("load-data", {
    description: "加载数据到目标",
    params: { data: { type: "string", required: true }, target: { type: "string", required: true } },
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      console.log(`  [Member A] loading to: ${ctx.params.target}`);
      ctx.report({ step: "writing", progress: 50 });
      await sleep(300);
      ctx.report({ step: "done", progress: 100 });
      return { written: true };
    },
  });

  // Member B 注册能力: 数据转换
  memberB.register("transform-data", {
    description: "转换数据格式",
    params: { data: { type: "string", required: true }, format: { type: "string" } },
    mode: "queue",
    priority: 1,
    execute: async (ctx) => {
      console.log(`  [Member B] transforming: ${ctx.params.data}`);
      ctx.report({ step: "parsing", progress: 40 });
      await sleep(200);
      ctx.report({ step: "converting", progress: 80 });
      await sleep(200);
      return { result: "transformed-data", rows: 150 };
    },
  });

  // Members 监听资源变更
  memberA.on("resource-changed", (event) => {
    console.log(`[Member A] resource change: ${event.action} ${event.path}`);
  });
  memberB.on("resource-changed", (event) => {
    console.log(`[Member B] resource change: ${event.action} ${event.path}`);
  });

  // 连接
  await leader.connect();
  await memberA.connect();
  await memberB.connect();
  console.log("[All] connected\n");

  await sleep(500);

  // ============================================================
  // 第三部分：Leader 注册知识库
  // ============================================================
  console.log("--- Leader registers knowledge ---");
  await leader.registerResource(
    "workflow/etl-pipeline.md",
    "# ETL Pipeline\n\n## Steps\n1. extract-data → member-a\n2. transform-data → member-b\n3. load-data → member-a\n"
  );

  await sleep(300);

  // ============================================================
  // 第四部分：任务流转 — Leader 编排 ETL 流水线
  // ============================================================
  console.log("\n--- Task flow: ETL Pipeline ---");

  // Step 1: 提取数据 → Member A
  console.log("\n[Leader] Step 1: extract-data");
  const step1 = await leader.execute("extract-data", { source: "mysql://prod-db" });
  console.log("[Leader] Step 1 result:", step1);

  // Step 2: 转换数据 → Member B
  console.log("\n[Leader] Step 2: transform-data");
  const step2 = await leader.execute("transform-data", { data: JSON.stringify(step1) });
  console.log("[Leader] Step 2 result:", step2);

  // Step 3: 加载数据 → Member A
  console.log("\n[Leader] Step 3: load-data");
  const step3 = await leader.execute("load-data", { data: JSON.stringify(step2), target: "warehouse" });
  console.log("[Leader] Step 3 result:", step3);

  console.log("\n[Leader] ETL Pipeline complete!");

  // ============================================================
  // 第五部分：资源管理 + 任务结合
  // ============================================================
  console.log("\n--- Update workflow and run again ---");

  // Leader 更新知识库（新增校验步骤）
  await leader.registerResource(
    "workflow/etl-pipeline.md",
    "# ETL Pipeline v2\n\n## Steps\n1. extract-data → member-a\n2. transform-data → member-b\n3. validate → member-b\n4. load-data → member-a\n"
  );

  // Member 查询最新知识
  const latest = await memberB.getResource("workflow/etl-pipeline.md");
  console.log("[Member B] latest workflow:", latest.split("\n").find((l: string) => l.includes("validate")));

  // Leader 按新流程执行
  console.log("\n[Leader] Running updated pipeline...");
  const r1 = await leader.execute("extract-data", { source: "postgres://analytics" });
  console.log("[Leader] extract:", r1);
  const r2 = await leader.execute("transform-data", { data: JSON.stringify(r1) });
  console.log("[Leader] transform:", r2);
  // (validate 步骤暂未注册，跳过)
  const r3 = await leader.execute("load-data", { data: JSON.stringify(r2), target: "data-lake" });
  console.log("[Leader] load:", r3);

  console.log("\n[Leader] Updated pipeline complete!");

  // Cleanup
  leader.disconnect();
  memberA.disconnect();
  memberB.disconnect();
  await team.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
