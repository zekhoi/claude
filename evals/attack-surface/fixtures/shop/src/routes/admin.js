export default async function adminRoutes(app) {
  app.get("/users", async () => app.db.users.all());
  app.post("/users/:id/role", { onRequest: app.authenticate }, async (request) => {
    return app.db.users.setRole(request.params.id, request.body.role);
  });
}
