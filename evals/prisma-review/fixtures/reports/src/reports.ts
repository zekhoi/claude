import { PrismaClient } from "@prisma/client";

export function reports(prisma: PrismaClient) {
  return {
    recentOrders(tenantId: number, take = 50) {
      return prisma.order.findMany({
        where: { tenantId },
        orderBy: { id: "desc" },
        take,
        select: { id: true, status: true, items: { select: { sku: true, quantity: true } } },
      });
    },

    async unitsBySku(tenantId: number) {
      const rows = await prisma.orderItem.groupBy({
        by: ["sku"],
        where: { order: { tenantId } },
        _sum: { quantity: true },
        orderBy: { sku: "asc" },
      });
      return rows.map((r) => ({ sku: r.sku, units: r._sum.quantity ?? 0 }));
    },

    async markShipped(tenantId: number, orderId: number) {
      const { count } = await prisma.order.updateMany({
        where: { id: orderId, tenantId },
        data: { status: "shipped" },
      });
      return count === 1;
    },
  };
}
