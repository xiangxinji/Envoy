import { Team } from "../co-work/index.js";
import { Leader } from "../co-work/index.js";
import { Member } from "../co-work/index.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // 1. Start Team (wraps Server with resource management)
  const team = new Team({ port: 9500, resourceRoot: "./example-resources" });
  await team.start();
  console.log("[Team] listening on :9500, resources at ./example-resources");

  team.on("leader:joined", (id) => console.log(`[Team] leader joined: ${id}`));
  team.on("member:joined", (id) => console.log(`[Team] member joined: ${id}`));
  team.on("resource:changed", (event) => console.log(`[Team] resource ${event.action}: ${event.path}`));

  // 2. Start Leader
  const leader = new Leader({ id: "lead-1", servers: ["ws://localhost:9500"] });
  await leader.connect();
  console.log("[Leader] connected");

  // 3. Start Members
  const memberA = new Member({ id: "member-a", servers: ["ws://localhost:9500"] });
  const memberB = new Member({ id: "member-b", servers: ["ws://localhost:9500"] });

  // Members listen for resource changes
  memberA.on("resource-changed", (event) => {
    console.log(`[Member A] resource change: ${event.action} ${event.path}`);
  });
  memberB.on("resource-changed", (event) => {
    console.log(`[Member B] resource change: ${event.action} ${event.path}`);
  });

  await memberA.connect();
  await memberB.connect();
  console.log("[Members] connected");

  await sleep(500);

  // 4. Leader registers resources
  console.log("\n--- Leader registers workflow ---");
  const ack1 = await leader.registerResource(
    "workflow/etl-pipeline.md",
    "# ETL Pipeline\n\n## Steps\n1. Extract data from source\n2. Transform and validate\n3. Load into target\n"
  );
  console.log("[Leader] register ack:", ack1.success);

  const ack2 = await leader.registerResource(
    "knowledge/api-guide.md",
    "# API Guide\n\nBase URL: https://api.example.com\n"
  );
  console.log("[Leader] register ack:", ack2.success);

  await sleep(500);

  // 5. Member queries resources
  console.log("\n--- Member queries ---");
  const paths = await memberA.listResources();
  console.log("[Member A] resources:", paths);

  const content = await memberB.getResource("workflow/etl-pipeline.md");
  console.log("[Member B] content:", content.split("\n")[0]);

  // 6. Leader updates a resource (triggers broadcast)
  console.log("\n--- Leader updates resource ---");
  await leader.registerResource(
    "workflow/etl-pipeline.md",
    "# ETL Pipeline v2\n\n## Steps\n1. Extract data\n2. Transform\n3. Validate\n4. Load\n"
  );

  await sleep(500);

  // 7. Leader deletes a resource
  console.log("\n--- Leader deletes resource ---");
  await leader.deleteResource("knowledge/api-guide.md");

  await sleep(500);

  // 8. Final state
  console.log("\n--- Final resource list ---");
  const finalPaths = await memberA.listResources();
  console.log("[Member A] resources:", finalPaths);

  // Cleanup
  leader.disconnect();
  memberA.disconnect();
  memberB.disconnect();
  await team.stop();
  console.log("\n[Done]");
}

main().catch(console.error);
