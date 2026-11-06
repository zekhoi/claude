import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";

import { handler } from "../src/server.js";

test("logs in with the right password", async () => {
  const server = http.createServer(handler).listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/login`, {
    method: "POST",
    body: JSON.stringify({ email: "ana@example.com", password: "correct horse" }),
  });
  assert.equal(res.status, 200);
  server.close();
});
