import { db } from "./db.js";

/** Orders for a tenant, newest first, with the customer's name when the customer still exists. */
export async function recentOrders(tenantId: number, limit: number) {
  return db
    .selectFrom("orders")
    .leftJoin("customers", (join) =>
      join.onRef("customers.id", "=", "orders.customer_id").on("customers.tenant_id", "=", tenantId),
    )
    .select(["orders.id", "orders.status", "orders.total_cents", "customers.name as customer_name"])
    .where("orders.tenant_id", "=", tenantId)
    .orderBy("orders.created_at", "desc")
    .orderBy("orders.id", "desc")
    .limit(limit)
    .execute();
}

/** Marks a tenant's order as paid; throws when the order does not exist for that tenant. */
export async function markPaid(tenantId: number, orderId: number) {
  return db.transaction().execute(async (trx) => {
    const order = await trx
      .selectFrom("orders")
      .select(["id", "status"])
      .where("tenant_id", "=", tenantId)
      .where("id", "=", orderId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (order.status !== "open") return false;
    await trx
      .updateTable("orders")
      .set({ status: "paid" })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", orderId)
      .execute();
    return true;
  });
}
