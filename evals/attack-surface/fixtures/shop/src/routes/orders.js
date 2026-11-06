export default async function orderRoutes(app) {
  app.get("/:id", { onRequest: app.authenticate }, async (request) => {
    return app.db.orders.findById(request.params.id);
  });
  app.get("/export", { onRequest: app.authenticate }, async (request) => {
    const url = request.query.callback;
    const rows = await app.db.orders.forTenant(request.user.tenantId);
    if (url) await fetch(url, { method: "POST", body: JSON.stringify(rows) });
    return rows;
  });
  app.post("/:id/notes", { onRequest: app.authenticate }, async (request) => {
    return app.db.notes.create({ orderId: request.params.id, text: request.body.text });
  });
}
