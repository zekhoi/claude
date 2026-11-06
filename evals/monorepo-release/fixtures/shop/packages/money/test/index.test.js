import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPrice } from "../src/index.js";

test("formats cents", () => {
  assert.equal(formatPrice(1250), "$12.50");
});
