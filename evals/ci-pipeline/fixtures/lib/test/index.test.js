import assert from "node:assert/strict";
import { test } from "node:test";

import { slugify } from "../src/index.js";

test("slugifies text", () => {
  assert.equal(slugify("Héllo, World!"), "hello-world");
});
