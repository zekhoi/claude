import assert from "node:assert/strict";
import { test } from "node:test";

import { getOrder, listOrders } from "../src/orders.js";

const db = {
  orders: [
    { id: 1, tenantId: "acme", total: 120 },
    { id: 2, tenantId: "globex", total: 75 },
  ],
};
const alice = { id: "alice", tenantId: "acme" };

test("returns the user's order", () => {
  assert.equal(getOrder(db, alice, 1).status, 200);
});

test("lists only the tenant's orders", () => {
  assert.deepEqual(listOrders(db, alice).body.map((o) => o.id), [1]);
});
