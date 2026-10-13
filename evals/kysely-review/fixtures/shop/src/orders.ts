import { sql } from "kysely";
import { db } from "./db.js";

export async function cancelOrder(tenantId: number, orderId: number) {
  await db.updateTable("orders").set({ status: "cancelled" }).execute();
}

export async function listOrders(tenantId: number, sortColumn: string) {
  return db
    .selectFrom("orders")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .orderBy(sql.raw(sortColumn))
    .execute();
}

export async function placeOrder(
  tenantId: number,
  customerId: number,
  items: { sku: string; quantity: number }[],
) {
  return db.transaction().execute(async (trx) => {
    const order = await trx
      .insertInto("orders")
      .values({ tenant_id: tenantId, customer_id: customerId, status: "open", total_cents: 0 })
      .returning("id")
      .executeTakeFirstOrThrow();
    for (const item of items) {
      await db.insertInto("order_items").values({ order_id: order.id, ...item }).execute();
    }
    return order.id;
  });
}

export async function ordersWithItems(tenantId: number) {
  const orders = await db.selectFrom("orders").selectAll().where("tenant_id", "=", tenantId).execute();
  const result = [];
  for (const order of orders) {
    const items = await db.selectFrom("order_items").selectAll().where("order_id", "=", order.id).execute();
    result.push({ ...order, items });
  }
  return result;
}

export async function customerEmail(tenantId: number, customerId: number) {
  const customer = await db
    .selectFrom("customers")
    .select("email")
    .where("id", "=", customerId)
    .executeTakeFirst();
  return customer!.email;
}
