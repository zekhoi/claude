import Fastify from "fastify";
import usersRoutes from "./routes/users.js";

export function buildApp(options = {}) {
  const app = Fastify(options);
  app.decorate(
    "users",
    new Map([
      [1, { id: 1, name: "Ada", email: "ada@example.com", active: true, passwordHash: "$2b$hash" }],
      [2, { id: 2, name: "Grace", email: "grace@example.com", active: true, passwordHash: "$2b$hash" }],
    ]),
  );
  app.register(usersRoutes, { prefix: "/users" });
  return app;
}
