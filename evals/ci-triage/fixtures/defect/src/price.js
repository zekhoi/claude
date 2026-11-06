// Applies a percentage discount and rounds to cents.
export function applyDiscount(amountCents, percent) {
  return Math.round(amountCents - (amountCents * percent) / 10);
}
