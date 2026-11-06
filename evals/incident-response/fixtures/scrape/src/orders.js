export async function getOrder(db, request) {
  // Authenticated route: GET /api/orders/:id
  return db.orders.findById(Number(request.params.id));
}
