import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/core/diff.js";

const labels = { from: "a/f.md", to: "b/f.md" };
const join = (...lines: string[]) => lines.join("\n");

describe("unifiedDiff", () => {
  it("is empty for equivalent text, including line-ending differences", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n", labels)).toBe("");
    expect(unifiedDiff("a\r\nb\r\n", "a\nb", labels)).toBe("");
  });

  it("produces a unified diff with context", () => {
    expect(
      unifiedDiff(join("1", "2", "3", "4", "5"), join("1", "2", "THREE", "4", "5"), labels),
    ).toBe(
      join("--- a/f.md", "+++ b/f.md", "@@ -1,5 +1,5 @@", " 1", " 2", "-3", "+THREE", " 4", " 5"),
    );
  });

  it("uses zero-length ranges for additions to and deletions from empty files", () => {
    expect(unifiedDiff("", join("x", "y"), labels)).toBe(
      join("--- a/f.md", "+++ b/f.md", "@@ -0,0 +1,2 @@", "+x", "+y"),
    );
    expect(unifiedDiff("x", "", labels)).toBe(
      join("--- a/f.md", "+++ b/f.md", "@@ -1 +0,0 @@", "-x"),
    );
  });

  it("splits distant changes into separate hunks and merges nearby ones", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const far = [...before];
    far[1] = "changed 2";
    far[17] = "changed 18";
    const farDiff = unifiedDiff(before.join("\n"), far.join("\n"), labels);
    expect(farDiff.match(/^@@/gm)).toHaveLength(2);
    expect(farDiff).toContain("@@ -1,5 +1,5 @@");
    expect(farDiff).toContain("@@ -15,6 +15,6 @@");

    const near = [...before];
    near[1] = "changed 2";
    near[7] = "changed 8";
    expect(unifiedDiff(before.join("\n"), near.join("\n"), labels).match(/^@@/gm)).toHaveLength(1);
  });

  it("falls back to a whole replacement for very large inputs", () => {
    const big = Array.from({ length: 2100 }, (_, i) => `a${i}`).join("\n");
    const other = Array.from({ length: 2100 }, (_, i) => `b${i}`).join("\n");
    const diff = unifiedDiff(big, other, labels);
    expect(diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"))).toHaveLength(
      2100,
    );
    expect(diff).toContain("@@ -1,2100 +1,2100 @@");
  });
});
