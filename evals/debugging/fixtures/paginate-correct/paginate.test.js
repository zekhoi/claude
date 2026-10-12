import assert from "node:assert/strict";
import { test } from "node:test";
import { paginate } from "./paginate.js";

test("first page returns the first items", () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 1, 2), [1, 2]);
});

test("second page returns the next items", () => {
  assert.deepEqual(paginate([1, 2, 3, 4, 5], 2, 2), [3, 4]);
});
