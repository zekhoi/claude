import Fastify from "fastify";

import { authenticate } from "./auth.js";
import adminRoutes from "./routes/admin.js";
import orderRoutes from "./routes/orders.js";
import webhookRoutes from "./routes/webhooks.js";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.decorate("authenticate", authenticate);
  app.get("/health", async () => ({ ok: true }));
  app.get("/debug/config", async () => ({ env: process.env }));
  app.register(orderRoutes, { prefix: "/api/orders" });
  app.register(adminRoutes, { prefix: "/admin" });
  app.register(webhookRoutes, { prefix: "/webhooks" });
  return app;
}
