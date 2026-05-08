import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { StateStore } from "./state-store.js";

export function createSSEApp(store: StateStore): Hono {
  const app = new Hono();

  app.get("/sse", (c) => {
    return streamSSE(c, async (stream) => {
      // Push initial state on connect
      await stream.writeSSE({
        event: "init",
        data: JSON.stringify({
          clients: store.getAllClients(),
          capabilities: store.getCapabilities(),
          tasks: store.getAllTasks(),
          status: store.getStatus(),
        }),
      });

      const onInit = async (data: unknown) => {
        await stream.writeSSE({ event: "init", data: JSON.stringify(data) });
      };
      const onClientOnline = async (state: unknown) => {
        await stream.writeSSE({ event: "client:online", data: JSON.stringify(state) });
      };
      const onClientOffline = async (info: unknown) => {
        await stream.writeSSE({ event: "client:offline", data: JSON.stringify(info) });
      };
      const onClientRegistered = async (data: unknown) => {
        await stream.writeSSE({ event: "client:registered", data: JSON.stringify(data) });
      };
      const onTaskCreated = async (task: unknown) => {
        await stream.writeSSE({ event: "task:created", data: JSON.stringify(task) });
      };
      const onTaskUpdated = async (task: unknown) => {
        await stream.writeSSE({ event: "task:updated", data: JSON.stringify(task) });
      };

      store.on("init", onInit);
      store.on("client:online", onClientOnline);
      store.on("client:offline", onClientOffline);
      store.on("client:registered", onClientRegistered);
      store.on("task:created", onTaskCreated);
      store.on("task:updated", onTaskUpdated);

      stream.onAbort(() => {
        store.off("init", onInit);
        store.off("client:online", onClientOnline);
        store.off("client:offline", onClientOffline);
        store.off("client:registered", onClientRegistered);
        store.off("task:created", onTaskCreated);
        store.off("task:updated", onTaskUpdated);
      });

      // Keep connection alive
      while (true) {
        await stream.writeSSE({ event: "ping", data: "" });
        await stream.sleep(30000);
      }
    });
  });

  return app;
}
