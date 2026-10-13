import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { buildApp } from "../src/app.js";

describe("GET /users/:id", () => {
  const app = buildApp();
  after(() => app.close());

  it("returns the user without private fields", async () => {
    const response = await app.inject({ method: "GET", url: "/users/1" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { id: 1, name: "Ada", email: "ada@example.com", active: true });
  });

  it("returns 404 for unknown users", async () => {
    const response = await app.inject({ method: "GET", url: "/users/99" });
    assert.equal(response.statusCode, 404);
  });
});
