import assert from "node:assert/strict";
import { test } from "node:test";

import { applyDiscount } from "../src/price.js";

test("applies a percentage discount", () => {
  assert.equal(applyDiscount(1000, 10), 900);
});

test("keeps the amount without a discount", () => {
  assert.equal(applyDiscount(1000, 0), 1000);
});
