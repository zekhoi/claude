import type { Generated, Kysely, Selectable } from "kysely";

interface CustomersTable {
  id: Generated<number>;
  tenant_id: number;
  email: string;
  name: string | null;
}

interface OrdersTable {
  id: Generated<number>;
  tenant_id: number;
  customer_id: number;
  status: "open" | "paid" | "cancelled";
  total_cents: number;
  created_at: Generated<Date>;
}

interface OrderItemsTable {
  id: Generated<number>;
  order_id: number;
  sku: string;
  quantity: number;
}

export interface Database {
  customers: CustomersTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
}

export type Order = Selectable<OrdersTable>;

export declare const db: Kysely<Database>;
