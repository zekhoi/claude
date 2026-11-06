import { roundCents } from "../../money/src/internal/round.js";

export function displayCents(value) {
  return String(roundCents(value));
}
