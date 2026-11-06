// Order access for an authenticated user. `db` is an in-memory store in tests.
export function getOrder(db, user, orderId) {
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return { status: 404, body: { error: "not found" } };
  return { status: 200, body: order };
}

export function listOrders(db, user) {
  return { status: 200, body: db.orders.filter((o) => o.tenantId === user.tenantId) };
}
