import { and, desc, eq, sum } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { orderItems, orders } from "./schema";

export function reports(db: NodePgDatabase) {
  return {
    recentOrders(tenantId: number, limit = 50) {
      return db
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(eq(orders.tenantId, tenantId))
        .orderBy(desc(orders.id))
        .limit(limit);
    },

    unitsBySku(tenantId: number) {
      return db
        .select({ sku: orderItems.sku, units: sum(orderItems.quantity) })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(eq(orders.tenantId, tenantId))
        .groupBy(orderItems.sku)
        .orderBy(orderItems.sku);
    },

    async markShipped(tenantId: number, orderId: number) {
      const updated = await db
        .update(orders)
        .set({ status: "shipped" })
        .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
        .returning({ id: orders.id });
      return updated.length === 1;
    },
  };
}
