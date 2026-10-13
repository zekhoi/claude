import assert from "node:assert/strict";
import { test } from "node:test";
import { orderTotal, quoteTotal } from "./pricing.js";

const items = [{ price: 40, quantity: 3 }];

test("regular customers get 5% off orders over 100", () => {
  assert.equal(orderTotal(items, { vip: false }), 114);
});

test("VIP customers get 10% off", () => {
  assert.equal(orderTotal(items, { vip: true }), 108);
});

test("quotes add a handling fee after discounts", () => {
  assert.equal(quoteTotal(items, { vip: true }), 110.5);
});
