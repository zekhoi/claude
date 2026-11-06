export default async function webhookRoutes(app) {
  app.post("/payments", async (request) => {
    const event = request.body;
    if (event.type === "payment.succeeded") await app.db.orders.markPaid(event.orderId);
    return { received: true };
  });
}
