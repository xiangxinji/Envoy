import { Hono } from "hono";
import type { StateStore } from "./state-store.js";

export function createApiApp(store: StateStore): Hono {
  const app = new Hono();

  app.get("/api/status", (c) => {
    return c.json(store.getStatus());
  });

  app.get("/api/clients", (c) => {
    return c.json(store.getAllClients());
  });

  app.get("/api/clients/:id", (c) => {
    const client = store.getClient(c.req.param("id"));
    if (!client) {
      return c.json({ error: "Client not found" }, 404);
    }
    return c.json(client);
  });

  app.get("/api/capabilities", (c) => {
    return c.json(store.getCapabilities());
  });

  return app;
}
