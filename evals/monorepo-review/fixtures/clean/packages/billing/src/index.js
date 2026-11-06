import { z } from "zod";
import { formatPrice } from "@shop/money";

const Item = z.object({ name: z.string(), cents: z.number().int() });

export function invoiceLine(item) {
  const { name, cents } = Item.parse(item);
  return `${name}: ${formatPrice(cents)}`;
}
