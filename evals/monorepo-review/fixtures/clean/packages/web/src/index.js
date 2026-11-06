import { invoiceLine } from "@shop/billing";

export function renderInvoice(items) {
  return items.map(invoiceLine).join("\n");
}
