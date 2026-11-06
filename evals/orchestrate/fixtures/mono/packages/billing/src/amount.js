// Parses an amount like "12.50" into integer cents.
export function parseAmount(text) {
  return Math.round(Number(text) * 100);
}
