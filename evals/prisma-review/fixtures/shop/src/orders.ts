import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function cancelOrders(tenantId: number) {
  await prisma.order.deleteMany({});
}

export async function listOrders(tenantId: number, sortColumn: string) {
  return prisma.$queryRawUnsafe(
    `SELECT id, status FROM "Order" WHERE "tenantId" = $1 ORDER BY ${sortColumn}`,
    tenantId,
  );
}

export async function placeOrder(
  tenantId: number,
  customerId: number,
  items: { sku: string; quantity: number }[],
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: { tenantId, customerId, status: "new" } });
    for (const item of items) {
      await prisma.orderItem.create({ data: { orderId: order.id, ...item } });
    }
    return order.id;
  });
}

export async function ordersWithItems(tenantId: number) {
  const orders = await prisma.order.findMany({ where: { tenantId } });
  const result = [];
  for (const order of orders) {
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    result.push({ id: order.id, skus: items.map((i) => i.sku) });
  }
  return result;
}

export async function customerProfile(customerId: number) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  return { email: customer!.email, customer };
}
