import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchRate } from "../src/rates.js";

test("returns the rate from a stubbed response", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ rate: 1.08 }) });
  assert.equal(await fetchRate("EURUSD", fakeFetch), 1.08);
});

test("returns the live rate", { timeout: 2000 }, async () => {
  const rate = await fetchRate("EURUSD");
  assert.ok(rate > 0);
});
