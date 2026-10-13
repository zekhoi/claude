import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Math.round", () => {
  it("rounds half up", () => {
    assert.equal(Math.round(2.5), 3);
  });
});
