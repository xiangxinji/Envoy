/**
 * Client 间定向消息示例：sendTo 发送 / on("message") 接收
 *
 * 场景：master 向指定 worker 发送指令并接收回复，形成请求-响应模式
 */
import { Server } from "../packages/server/server.js";
import { Client } from "../packages/client/client.js";

async function main() {
  const server = new Server({ port: 9021 });
  await server.start();
  console.log("[server] 已启动 :9021");

  // 1. Worker 注册，监听来自其他 Client 的指令
  const worker = new Client({ id: "worker", servers: ["ws://localhost:9021"] });

  worker.on("message", (msg) => {
    if (msg.subtype === "exec") {
      const { command, args } = msg.payload as { command: string; args: string[] };
      console.log(`[worker] 收到指令: ${command} ${args.join(" ")}`);
      console.log(`[worker] 发起者: ${msg.from}`);

      // 处理并回复
      worker.sendTo(msg.from, "exec:result", {
        command,
        success: true,
        output: `${command}: done`,
      });
    }
  });

  await worker.connect();

  // 2. Master 连接
  const master = new Client({ id: "master", servers: ["ws://localhost:9021"] });

  master.on("message", (msg) => {
    if (msg.subtype === "exec:result") {
      const result = msg.payload as { command: string; success: boolean; output: string };
      console.log(`[master] 收到结果: ${result.command} -> ${result.output}`);
    }
  });

  await master.connect();
  await new Promise((r) => setTimeout(r, 200));
  console.log("[server] master, worker 已上线");

  // 3. Master 向指定 Worker 发送指令
  console.log("\n--- 发送指令到 worker ---");
  master.sendTo("worker", "exec", { command: "build", args: ["--prod"] });
  await new Promise((r) => setTimeout(r, 500));

  master.sendTo("worker", "exec", { command: "deploy", args: ["--env", "staging"] });
  await new Promise((r) => setTimeout(r, 500));

  // 4. Master 向 Server 发送消息
  console.log("\n--- Master 向 Server 发消息 ---");
  server.on("message", (clientId, msg) => {
    if (msg.subtype === "log") {
      console.log(`[server] 收到 ${clientId} 日志:`, msg.payload);
    }
  });
  master.send("log", { action: "deploy", status: "finished", timestamp: Date.now() });

  await new Promise((r) => setTimeout(r, 500));

  master.disconnect();
  worker.disconnect();
  await server.stop();
  console.log("\n[demo] 结束");
}

main().catch(console.error);
