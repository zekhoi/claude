import { z } from "zod";

const Cents = z.number().int();

export function formatPrice(cents) {
  return `$${(Cents.parse(cents) / 100).toFixed(2)}`;
}
