import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { WatcherClient } from "uniopc/client";
import type { WatcherSnapshot, WatcherClientEvents } from "uniopc/client";
import type { TaskRecord } from "uniopc/core/task";
import { StateStore } from "./state-store.js";
import { createApiApp } from "./api.js";
import { createSSEApp } from "./sse.js";

type Snapshot = WatcherClientEvents["snapshot"] extends (s: infer S) => void ? S : never;
type ClientOnlineState = WatcherClientEvents["client:online"] extends (s: infer S) => void ? S : never;
type ClientOfflineInfo = WatcherClientEvents["client:offline"] extends (s: infer S) => void ? S : never;
type ClientRegisteredData = WatcherClientEvents["client:registered"] extends (s: infer S) => void ? S : never;

const uniopcUrl = process.env.UNIOPC_URL ?? "ws://localhost:9400";
const monitorPort = parseInt(process.env.MONITOR_PORT ?? "3000", 10);

const store = new StateStore();

const watcher = new WatcherClient({
  id: `monitor-${Date.now()}`,
  servers: [uniopcUrl],
});

watcher.on("snapshot", (snapshot: unknown) => {
  store.applySnapshot(snapshot as WatcherSnapshot);
  console.log(`[monitor] 收到 snapshot: ${(snapshot as Snapshot).clients.length} 个客户端`);
});

watcher.on("client:online", (state: unknown) => {
  store.applyClientOnline(state as ClientOnlineState);
  console.log(`[monitor] 客户端上线: ${(state as ClientOnlineState).id}`);
});

watcher.on("client:offline", (info: unknown) => {
  store.applyClientOffline((info as ClientOfflineInfo).id);
  console.log(`[monitor] 客户端离线: ${(info as ClientOfflineInfo).id}`);
});

watcher.on("client:registered", (data: unknown) => {
  store.applyClientRegistered(data as ClientRegisteredData);
  console.log(`[monitor] 客户端注册能力: ${(data as ClientRegisteredData).clientId}`);
});

watcher.on("task:created", (task: unknown) => {
  store.applyTaskCreated(task as TaskRecord);
  console.log(`[monitor] 任务创建: ${(task as TaskRecord).id}`);
});

watcher.on("task:updated", (task: unknown) => {
  store.applyTaskUpdated(task as TaskRecord);
  console.log(`[monitor] 任务更新: ${(task as TaskRecord).id} -> ${(task as TaskRecord).status}`);
});

watcher.on("error", (err: unknown) => {
  console.error("[monitor] 错误:", err);
});

const app = new Hono();
app.route("/", createApiApp(store));
app.route("/", createSSEApp(store));

// Serve frontend static files in production
app.use("/*", serveStatic({ root: "../web/dist", rewriteRequestPath: (p) => p }));

await watcher.connect();
console.log(`[monitor] 已连接到 UniOpc Server: ${uniopcUrl}`);

serve({ fetch: app.fetch, port: monitorPort }, (info) => {
  console.log(`[monitor] 服务已启动: http://localhost:${info.port}`);
});
