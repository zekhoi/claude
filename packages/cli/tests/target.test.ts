import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTargetFile, resolveTarget } from "../src/core/target.js";
import { tempDir, writeTree } from "./helpers.js";

describe("readTargetFile", () => {
  it("reads files and reports missing ones", async () => {
    const root = (await resolveTarget(await writeTree({ "a.md": "hi" }))).root!;
    expect(await readTargetFile(root, "a.md")).toMatchObject({ state: "file", text: "hi" });
    expect(await readTargetFile(root, "x/y/z.md")).toEqual({
      state: "missing",
      missingDirs: ["x", "x/y"],
    });
    expect(await readTargetFile(root, "b.md")).toEqual({ state: "missing" });
  });

  it("rejects parents that resolve outside the target through a symlink", async () => {
    const outside = await tempDir();
    const root = (await resolveTarget(await tempDir())).root!;
    await symlink(outside, path.join(root, ".claude"));
    expect((await readTargetFile(root, ".claude/skills/kit-x/SKILL.md")).state).toBe("unsafe");
  });

  it("allows symlinked parents that stay inside the target", async () => {
    const root = (await resolveTarget(await tempDir())).root!;
    await mkdir(path.join(root, "shared"));
    await symlink(path.join(root, "shared"), path.join(root, ".claude"));
    expect((await readTargetFile(root, ".claude/rules/x.md")).state).toBe("missing");
  });

  it("rejects destinations that are symlinks, directories, or not UTF-8", async () => {
    const root = (await resolveTarget(await writeTree({ "real.md": "x" }))).root!;
    await symlink(path.join(root, "real.md"), path.join(root, "link.md"));
    await mkdir(path.join(root, "dir.md"));
    await writeFile(path.join(root, "bin.md"), Buffer.from([0xff, 0xfe]));
    for (const p of ["link.md", "dir.md", "bin.md", "../escape.md"]) {
      expect((await readTargetFile(root, p)).state).toBe("unsafe");
    }
  });

  it("rejects targets that are missing or not directories", async () => {
    const root = await writeTree({ "file.txt": "x" });
    expect((await resolveTarget(path.join(root, "nope"))).diagnostics[0]?.code).toBe(
      "TARGET_INVALID",
    );
    expect((await resolveTarget(path.join(root, "file.txt"))).diagnostics[0]?.code).toBe(
      "TARGET_INVALID",
    );
  });
});
