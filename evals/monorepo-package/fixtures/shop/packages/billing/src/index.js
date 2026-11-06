import { formatPrice } from "@shop/money";

// Renders one invoice line.
export function invoiceLine(item) {
  return `${item.name}: ${formatPrice(item.cents)}`;
}
