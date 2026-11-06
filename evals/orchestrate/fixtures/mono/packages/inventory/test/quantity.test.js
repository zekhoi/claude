import assert from "node:assert/strict";
import { test } from "node:test";

import { parseQuantity } from "../src/quantity.js";

test("parses a quantity", () => {
  assert.equal(parseQuantity("3"), 3);
});
