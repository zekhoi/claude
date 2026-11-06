import assert from "node:assert/strict";
import { test } from "node:test";

import { invoiceLine } from "../src/index.js";

test("renders a line", () => {
  assert.equal(invoiceLine({ name: "Pen", cents: 250 }), "Pen: $2.50");
});
