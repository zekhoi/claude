import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBlock, removeBlock } from "../src/core/blocks.js";
import { workspacePackages } from "../src/core/workspaces.js";
import { json, kit } from "./cli-helpers.js";
import { snapshotTree, tempDir, writeTree } from "./helpers.js";

const MANIFEST = ".agent-kit/manifest.json";

/** The parts of a manifest these tests tamper with. */
interface Tamperable {
  cliVersion: string;
  items: Record<
    string,
    { version: string; files: { destination: string; install: string; sha256: string }[] }
  >;
  blocks: Record<string, { sha256: string; createdFile: boolean }>;
  contextPath?: string;
  createdDirs: string[];
}

/** A valid project manifest with one installed rule, ready to be tampered with. */
async function installed(): Promise<string> {
  const root = await tempDir();
  expect((await kit(root, ["add", "rule/testing"])).code).toBe(0);
  return root;
}
async function tamper(root: string, change: (m: Tamperable) => void) {
  const file = path.join(root, MANIFEST);
  const manifest = JSON.parse(await readFile(file, "utf8")) as Tamperable;
  change(manifest);
  await writeFile(file, JSON.stringify(manifest));
}

describe("security finding 1: manifest paths are limited to what agent-kit manages", () => {
  it.each([
    [
      "an item file outside the managed layout",
      (m: Tamperable) => (m.items["rule/testing"]!.files[0]!.destination = "src/index.ts"),
    ],
    [
      "a .git path",
      (m: Tamperable) => (m.items["rule/testing"]!.files[0]!.destination = ".git/HEAD"),
    ],
    [
      "a block in an arbitrary file",
      (m: Tamperable) => (m.blocks[".git/config"] = { sha256: "0".repeat(64), createdFile: false }),
    ],
    [
      "a guideline block outside the guideline files",
      (m: Tamperable) =>
        (m.items["guideline/engineering"] = {
          version: "1.0.0",
          files: [{ destination: ".git/config", install: "managed-block", sha256: "0".repeat(64) }],
        }),
    ],
    ["an unexpected context path", (m: Tamperable) => (m.contextPath = "src/index.ts")],
    [
      "a created directory outside the managed layout",
      (m: Tamperable) => (m.createdDirs = ["../victim"]),
    ],
  ])("rejects %s before changing anything", async (_, change) => {
    const root = await installed();
    await writeFile(path.join(root, "src-index.ts"), "x");
    await tamper(root, change);
    const before = await snapshotTree(root);
    for (const args of [["uninstall"], ["update"], ["init", "--preset", "base", "--context"]]) {
      const run = await json(root, args);
      expect(run.code, args.join(" ")).toBe(1);
      expect(run.result.diagnostics[0].code).toBe("MANIFEST_INVALID");
    }
    expect(await snapshotTree(root)).toEqual(before);
  });
});

describe("security finding 2: the state directory and manifest must be real, contained files", () => {
  it("refuses a symlinked .agent-kit and writes nothing outside the target", async () => {
    const outside = await tempDir();
    const root = await tempDir();
    await symlink(outside, path.join(root, ".agent-kit"));
    const run = await json(root, ["init", "--preset", "base"]);
    expect(run.code).not.toBe(0);
    expect(await snapshotTree(outside)).toEqual({});
  });

  it("refuses a manifest that is a symlink or not a regular file", async () => {
    const root = await installed();
    const real = path.join(root, MANIFEST);
    const copy = path.join(await tempDir(), "manifest.json");
    await writeFile(copy, await readFile(real));
    await rm(real);
    await symlink(copy, real);
    const run = await json(root, ["status"]);
    expect(run.code).toBe(1);
    expect(run.result.diagnostics[0].code).toBe("MANIFEST_INVALID");
  });

  it("does not hang on a FIFO manifest", async () => {
    if (process.platform === "win32") return;
    const root = await installed();
    await rm(path.join(root, MANIFEST));
    execFileSync("mkfifo", [path.join(root, MANIFEST)]);
    const run = await json(root, ["status"]);
    expect(run.code).toBe(1);
  }, 15_000);
});

describe("security finding 3: directory pruning stays inside the target", () => {
  it("never removes directories through .. or symlinks", async () => {
    const outside = await tempDir();
    await mkdir(path.join(outside, "victim/empty"), { recursive: true });
    const root = await installed();
    await tamper(root, (m) => (m.createdDirs = ["../victim/empty"]));
    await json(root, ["uninstall"]);
    expect((await snapshotTree(outside))["victim/empty/"]).toBe("");
  });
});

describe("security finding 4: block parsing is linear", () => {
  it("handles many blank lines quickly", () => {
    const body = `x${"\n ".repeat(200_000)}y`;
    const start = Date.now();
    parseBlock(`<!-- agent-kit:start -->\n${body}\n<!-- agent-kit:end -->\n`);
    removeBlock(`${"\n".repeat(200_000)}<!-- agent-kit:start -->\nb\n<!-- agent-kit:end -->\n`);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("keeps the same trimming behavior", () => {
    const parsed = parseBlock(
      "<!-- agent-kit:start -->\n\n \nbody\n\n  \n<!-- agent-kit:end -->\n",
    );
    expect(parsed).toMatchObject({ kind: "block", body: "body" });
    expect(removeBlock("# Notes\n\n\n<!-- agent-kit:start -->\nb\n<!-- agent-kit:end -->\n")).toBe(
      "# Notes\n",
    );
  });
});

describe("security finding 6: workspace patterns are bounded", () => {
  it("expands repeated globstars quickly", async () => {
    const root = await writeTree({
      "package.json": { workspaces: [Array.from({ length: 40 }, () => "**").join("/")] },
      "a/b/c/d/package.json": "{}",
    });
    const start = Date.now();
    const found = await workspacePackages(root);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(found).toContain("a/b/c/d");
  });
});

describe("security finding 7: terminal control characters are escaped in human output", () => {
  it("does not pass escape sequences from the manifest to the terminal", async () => {
    const root = await installed();
    await tamper(root, (m) => (m.cliVersion = "\u001b]0;PWNED\u0007\u001b[2J"));
    const run = await kit(root, ["status"]);
    expect(run.stdout).not.toContain("\u001b");
    expect(run.stdout).toContain("\\u001b");
  });
});
