import { writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { serializeManifest, emptyManifest } from "../src/core/manifest.js";
import { rawHash, resolveTarget } from "../src/core/target.js";
import { applyWrites, TargetChangedError } from "../src/core/writer.js";
import type { WriteOp } from "../src/core/plan-builder.js";
import { snapshotTree, writeTree } from "./helpers.js";

async function fixture() {
  const root = (
    await resolveTarget(await writeTree({ "AGENTS.md": "old\n", ".agent-kit/lock": "x" }))
  ).root!;
  const writes: WriteOp[] = [
    { destination: ".claude/skills/kit-a/SKILL.md", content: "new skill\n", expected: "missing" },
    { destination: "AGENTS.md", content: "replaced\n", expected: rawHash("old\n") },
  ];
  return { root, writes, manifest: serializeManifest(emptyManifest("1.0.0")) };
}

describe("applyWrites", () => {
  it("writes files and then the manifest, leaving no staging files", async () => {
    const { root, writes, manifest } = await fixture();
    await applyWrites(root, { writes, manifest });
    const tree = await snapshotTree(root);
    expect(tree[".claude/skills/kit-a/SKILL.md"]).toBe("new skill\n");
    expect(tree["AGENTS.md"]).toBe("replaced\n");
    expect(tree[".agent-kit/manifest.json"]).toBe(manifest);
    expect(Object.keys(tree).filter((k) => /\.agent-kit-\d+\.(tmp|bak)$/.test(k))).toEqual([]);
  });

  it("restores the previous state when any step fails", async () => {
    for (let failAt = 1; failAt <= 5; failAt++) {
      const { root, writes, manifest } = await fixture();
      const before = await snapshotTree(root);
      let step = 0;
      const failure = applyWrites(
        root,
        { writes, manifest },
        {
          onStep: () => {
            if (++step === failAt) throw new Error(`injected at ${failAt}`);
          },
        },
      );
      await expect(failure).rejects.toThrow(`injected at ${failAt}`);
      expect(await snapshotTree(root)).toEqual(before);
    }
  });

  it("stops and rolls back when a destination changes after planning", async () => {
    const { root, writes, manifest } = await fixture();
    const before = await snapshotTree(root);
    const failure = applyWrites(
      root,
      { writes, manifest },
      {
        onStep: (s) => {
          if (s === "commit AGENTS.md") writeFileSync(path.join(root, "AGENTS.md"), "edited\n");
        },
      },
    );
    await expect(failure).rejects.toBeInstanceOf(TargetChangedError);
    // Everything except the concurrent edit itself is rolled back, and the edit is preserved.
    expect(await snapshotTree(root)).toEqual({ ...before, "AGENTS.md": "edited\n" });
  });

  it("detects a destination created after planning", async () => {
    const { root, writes, manifest } = await fixture();
    await writeFile(path.join(root, "AGENTS.md"), "changed before apply\n");
    await expect(applyWrites(root, { writes, manifest })).rejects.toBeInstanceOf(
      TargetChangedError,
    );
    expect((await snapshotTree(root))[".claude/"]).toBeUndefined();
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe("changed before apply\n");
  });
});
