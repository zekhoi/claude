import assert from "node:assert/strict";
import { test } from "node:test";

import { slug } from "../src/index.js";

test("slugifies", () => {
  assert.equal(slug(" Hello World "), "hello-world");
});
