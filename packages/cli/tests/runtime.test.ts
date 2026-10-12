import { describe, expect, it } from "vitest";
import { isSupportedNode } from "../src/core/runtime.js";

describe("isSupportedNode", () => {
  it.each(["22.12.0", "v22.12.0", "22.20.1", "24.0.0", "26.11.1"])("accepts %s", (v) =>
    expect(isSupportedNode(v)).toBe(true),
  );

  it.each(["22.11.9", "20.20.2", "18.0.0"])("rejects %s", (v) =>
    expect(isSupportedNode(v)).toBe(false),
  );
});
