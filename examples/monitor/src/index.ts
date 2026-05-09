import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WatcherClient } from "envoy/client";
import type { WatcherSnapshot, WatcherClientEvents } from "envoy/client";
import { StateStore } from "./state-store.js";
import { createApiApp } from "./api.js";
import { getDashboardHtml } from "./dashboard.js";

type Snapshot = WatcherClientEvents["snapshot"] extends (s: infer S) => void ? S : never;
type ClientOnlineState = WatcherClientEvents["client:online"] extends (s: infer S) => void ? S : never;
type ClientOfflineInfo = WatcherClientEvents["client:offline"] extends (s: infer S) => void ? S : never;
type ClientRegisteredData = WatcherClientEvents["client:registered"] extends (s: infer S) => void ? S : never;

const envoyUrl = process.env.ENVOY_URL ?? "ws://localhost:9400";
const monitorPort = parseInt(process.env.MONITOR_PORT ?? "3000", 10);

const store = new StateStore();

const watcher = new WatcherClient({
  id: `monitor-${Date.now()}`,
  servers: [envoyUrl],
});

watcher.on("snapshot", (snapshot: unknown) => {
  const s = snapshot as Snapshot;
  store.applySnapshot(s as WatcherSnapshot);
  console.log(`[monitor] 收到 snapshot: ${s.clients.length} 个客户端`);
});

watcher.on("client:online", (state: unknown) => {
  const s = state as ClientOnlineState;
  store.applyClientOnline(s);
  console.log(`[monitor] 客户端上线: ${s.id}`);
});

watcher.on("client:offline", (info: unknown) => {
  const i = info as ClientOfflineInfo;
  store.applyClientOffline(i.id);
  console.log(`[monitor] 客户端离线: ${i.id}`);
});

watcher.on("client:registered", (data: unknown) => {
  const d = data as ClientRegisteredData;
  store.applyClientRegistered(d);
  console.log(`[monitor] 客户端注册能力: ${d.clientId} (${d.capabilities.length} 个)`);
});

watcher.on("error", (err: unknown) => {
  console.error("[monitor] 错误:", err);
});

const app = new Hono();
app.route("/", createApiApp(store));
app.get("/", (c) => c.html(getDashboardHtml()));

await watcher.connect();
console.log(`[monitor] 已连接到 Envoy Server: ${envoyUrl}`);

serve({ fetch: app.fetch, port: monitorPort }, (info) => {
  console.log(`[monitor] 仪表盘已启动: http://localhost:${info.port}`);
});
