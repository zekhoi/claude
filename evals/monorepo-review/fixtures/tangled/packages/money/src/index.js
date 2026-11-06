import { taxRate } from "@shop/billing";

export function withTax(cents) {
  return Math.round(cents * (1 + taxRate()));
}

export { roundCents } from "./internal/round.js";
