import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReport } from "../src/report.js";

test("builds a report per customer", () => {
  const customers = [
    { id: 1, firstName: "Ada", lastName: "Lovelace" },
    { id: 2, firstName: "Alan", lastName: "Turing" },
  ];
  const orders = [
    { id: 10, customerId: 1, amount: 5, skus: ["b", "a"] },
    { id: 11, customerId: 1, amount: 7, skus: ["a"] },
  ];
  assert.deepEqual(buildReport(orders, customers), [
    { id: 1, name: "Lovelace, Ada", orders: 2, total: 12, skus: ["a", "b"] },
    { id: 2, name: "Turing, Alan", orders: 0, total: 0, skus: [] },
  ]);
});
