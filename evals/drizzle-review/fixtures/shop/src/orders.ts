import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { customers, orderItems, orders } from "./schema";

const db = drizzle(process.env.DATABASE_URL!);

export async function cancelOrders(tenantId: number) {
  await db.update(orders).set({ status: "cancelled" });
}

export async function listOrders(tenantId: number, sortColumn: string) {
  return db.execute(
    sql`SELECT id, status FROM orders WHERE tenant_id = ${tenantId} ORDER BY ${sql.raw(sortColumn)}`,
  );
}

export async function placeOrder(
  tenantId: number,
  customerId: number,
  items: { sku: string; quantity: number }[],
) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({ tenantId, customerId, status: "new" })
      .returning();
    for (const item of items) {
      await db.insert(orderItems).values({ orderId: order.id, ...item });
    }
    return order.id;
  });
}

export async function ordersWithItems(tenantId: number) {
  const rows = await db.select().from(orders).where(eq(orders.tenantId, tenantId));
  const result = [];
  for (const order of rows) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    result.push({ id: order.id, skus: items.map((i) => i.sku) });
  }
  return result;
}

export async function customerProfile(customerId: number) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  return { email: customer.email, customer };
}
