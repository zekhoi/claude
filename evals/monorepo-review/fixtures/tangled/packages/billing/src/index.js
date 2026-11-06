import { withTax } from "@shop/money";
import groupBy from "lodash/groupBy.js";

export function taxRate() {
  return 0.1;
}

export function totalsByCustomer(items) {
  const groups = groupBy(items, "customerId");
  return Object.fromEntries(
    Object.entries(groups).map(([id, rows]) => [id, withTax(rows.reduce((s, r) => s + r.cents, 0))]),
  );
}
