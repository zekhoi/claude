const assert = require("node:assert/strict");
const { test } = require("node:test");

const { formatStatus } = require("../src/format.js");

test("keeps the status text", () => {
  for (const status of ["ok", "warn", "failed"]) {
    assert.ok(formatStatus(status).includes(status));
  }
});
