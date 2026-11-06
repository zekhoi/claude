import assert from "node:assert/strict";
import { test } from "node:test";

import { isOrderId, newOrderId } from "../src/ids.js";

test("creates valid order ids", () => {
  const id = newOrderId();
  assert.ok(isOrderId(id));
  assert.notEqual(id, newOrderId());
});

test("rejects other values", () => {
  assert.equal(isOrderId("ord_nope"), false);
  assert.equal(isOrderId("123"), false);
});
