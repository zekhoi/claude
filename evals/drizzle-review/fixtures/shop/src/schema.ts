import { index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    status: text("status").notNull(),
  },
  (t) => [index("orders_tenant_id_idx").on(t.tenantId, t.id)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    sku: text("sku").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("order_items_order_id_idx").on(t.orderId)],
);
