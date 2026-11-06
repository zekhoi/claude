import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAmount } from "../src/amount.js";

test("parses an amount into cents", () => {
  assert.equal(parseAmount("12.50"), 1250);
});
