import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCK_START } from "../src/core/blocks.js";
import { json, kit, wasKilled } from "./cli-helpers.js";
import { snapshotTree, tempDir, writeTree } from "./helpers.js";

const SKILL = ".claude/skills/kit-code-review/SKILL.md";

describe("init", () => {
  it("installs the base preset into an empty project", async () => {
    const root = await tempDir();
    const run = await json(root, ["init", "--preset", "base"]);
    expect(run.code).toBe(0);
    expect(run.result).toMatchObject({ command: "init", status: "ok", data: { applied: true } });
    const tree = await snapshotTree(root);
    expect(tree[SKILL]).toContain("name: kit-code-review");
    expect(tree[".claude/rules/agent-kit/testing.md"]).toContain("# Testing conventions");
    expect(tree["AGENTS.md"]).toContain("## Engineering guidelines");
    expect(tree["CLAUDE.md"]).toBe(`${BLOCK_START}\n\n@AGENTS.md\n\n<!-- agent-kit:end -->\n`);
    expect(tree[".agent-kit/lock"]).toBeUndefined();
    expect(JSON.parse(tree[".agent-kit/manifest.json"]!).presets).toEqual(["preset/base"]);
  });

  it("is idempotent", async () => {
    const root = await tempDir();
    await kit(root, ["init", "--preset", "node", "--context"]);
    const before = await snapshotTree(root);
    const again = await json(root, ["init", "--preset", "node", "--context"]);
    expect(again.code).toBe(0);
    expect(again.result.data.applied).toBe(false);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("makes zero filesystem changes in dry-run mode", async () => {
    const root = await writeTree({ "CLAUDE.md": "# Mine\n" });
    const before = await snapshotTree(root);
    const run = await json(root, ["init", "--preset", "base", "--context", "--dry-run"]);
    expect(run.code).toBe(0);
    expect(run.result.data).toMatchObject({ dryRun: true, applied: false });
    expect(run.result.data.changes.length).toBeGreaterThan(0);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("preserves existing instructions and CRLF line endings", async () => {
    const claude = "# Team\r\n\r\nUse pnpm.\r\n";
    const agents = "# Agents\n\nExisting shared rules.\n";
    const root = await writeTree({ "CLAUDE.md": claude, "AGENTS.md": agents });
    expect((await kit(root, ["init", "--preset", "base"])).code).toBe(0);
    const tree = await snapshotTree(root);
    expect(tree["CLAUDE.md"]!.startsWith(claude)).toBe(true);
    expect(tree["CLAUDE.md"]).not.toMatch(/[^\r]\n/);
    expect(tree["AGENTS.md"]!.startsWith(agents)).toBe(true);
  });

  it("treats Prettier-formatted blocks as unchanged", async () => {
    const root = await tempDir();
    await kit(root, ["init", "--preset", "base"]);
    const agents = path.join(root, "AGENTS.md");
    const text = await readFile(agents, "utf8");
    await writeFile(
      agents,
      text.replace("<!-- agent-kit:start -->\n\n", "<!-- agent-kit:start -->\n"),
    );
    const run = await json(root, ["init", "--preset", "base", "--context"]);
    expect(run.code).toBe(0);
    const blockChanges = run.result.data.changes.filter(
      (c: { destination: string; reason?: string }) =>
        c.destination === "AGENTS.md" && c.reason !== "already installed",
    );
    expect(blockChanges.map((c: { action: string }) => c.action)).toEqual(["update"]);
  });

  it("keeps a user-owned @AGENTS.md import and does not add a duplicate", async () => {
    const root = await writeTree({ "CLAUDE.md": "@AGENTS.md\n\n# Notes\n" });
    await kit(root, ["init", "--preset", "base"]);
    const tree = await snapshotTree(root);
    expect(tree["CLAUDE.md"]).toBe("@AGENTS.md\n\n# Notes\n");
    expect(JSON.parse(tree[".agent-kit/manifest.json"]!).claudeImport).toBe("user-owned");
  });

  it("creates the context template once and never overwrites it", async () => {
    const root = await tempDir();
    await kit(root, ["init", "--preset", "base", "--context"]);
    const context = path.join(root, "docs/agent-context.md");
    expect(await readFile(context, "utf8")).toContain("TODO:");
    await writeFile(context, "# Filled in by the team\n");
    await kit(root, ["init", "--preset", "base", "--context"]);
    expect(await readFile(context, "utf8")).toBe("# Filled in by the team\n");
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toContain("docs/agent-context.md");
  });

  it("cancels the whole batch on conflicts and exits with 2", async () => {
    const root = await writeTree({ [SKILL]: "my own skill\n" });
    const before = await snapshotTree(root);
    const run = await json(root, ["init", "--preset", "base"]);
    expect(run.code).toBe(2);
    expect(run.result.status).toBe("conflict");
    expect(run.result.diagnostics.map((d: { code: string }) => d.code)).toEqual([
      "UNMANAGED_FILE_CONFLICT",
    ]);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("requires --preset when not interactive", async () => {
    const root = await tempDir();
    const run = await json(root, ["init"]);
    expect(run.code).toBe(1);
    expect(run.result.diagnostics[0].code).toBe("INPUT_REQUIRED");
    expect(await snapshotTree(root)).toEqual({});
  });

  it("refuses manifests from a newer schema without writing", async () => {
    const root = await writeTree({ ".agent-kit/manifest.json": { manifestSchemaVersion: 99 } });
    const before = await snapshotTree(root);
    const run = await json(root, ["init", "--preset", "base"]);
    expect(run.code).toBe(1);
    expect(run.result.diagnostics[0].code).toBe("UNSUPPORTED_SCHEMA");
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("does not write through a symlinked directory that leaves the target", async () => {
    const outside = await tempDir();
    const root = await tempDir();
    const { symlink } = await import("node:fs/promises");
    await symlink(outside, path.join(root, ".claude"));
    const run = await json(root, ["init", "--preset", "base"]);
    expect(run.code).toBe(2);
    expect(await snapshotTree(outside)).toEqual({});
  });
});

describe("add", () => {
  it("adds items to an existing installation", async () => {
    const root = await tempDir();
    await kit(root, ["init", "--preset", "base"]);
    const run = await json(root, ["add", "agent/reviewer", "skill/database-design"]);
    expect(run.code).toBe(0);
    const manifest = JSON.parse(
      await readFile(path.join(root, ".agent-kit/manifest.json"), "utf8"),
    );
    expect(Object.keys(manifest.items)).toEqual(
      expect.arrayContaining(["agent/reviewer", "skill/database-design", "skill/code-review"]),
    );
    expect(await readFile(path.join(root, ".claude/agents/kit-reviewer.md"), "utf8")).toContain(
      "name: kit-reviewer",
    );
  });

  it("works without the guidelines and leaves root instruction files alone", async () => {
    const root = await tempDir();
    expect((await kit(root, ["add", "skill/debugging"])).code).toBe(0);
    const tree = await snapshotTree(root);
    expect(tree["AGENTS.md"]).toBeUndefined();
    expect(tree["CLAUDE.md"]).toBeUndefined();
  });

  it("rejects unknown items with exit code 1", async () => {
    const root = await tempDir();
    const run = await json(root, ["add", "skill/nope"]);
    expect(run.code).toBe(1);
    expect(run.result.diagnostics[0].code).toBe("UNKNOWN_ITEM");
    expect(await snapshotTree(root)).toEqual({});
  });
});

describe("show", () => {
  it("prints exact bundled content for one file", async () => {
    const root = await tempDir();
    await kit(root, ["add", "skill/code-review"]);
    const run = await kit(root, ["show", "skill/code-review", "--file", SKILL]);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe(await readFile(path.join(root, SKILL), "utf8"));
  });

  it("lists files and packaged paths", async () => {
    const run = await json(await tempDir(), ["show", "agent/debugger"]);
    expect(run.result.data.files[0]).toMatchObject({
      destination: ".claude/agents/kit-debugger.md",
    });
  });
});

describe("monorepo targets", () => {
  it("installs root and package targets independently", async () => {
    const root = await writeTree({ "package.json": "{}", "packages/api/package.json": "{}" });
    const pkg = path.join(root, "packages/api");
    expect((await kit(root, ["init", "--preset", "base"])).code).toBe(0);
    const rootTree = await snapshotTree(root);

    expect((await kit(pkg, ["add", "rule/typescript"])).code).toBe(0);
    const after = await snapshotTree(root);
    expect(after["packages/api/.claude/rules/agent-kit/typescript.md"]).toBeDefined();
    expect(after["packages/api/.agent-kit/manifest.json"]).toBeDefined();
    for (const [rel, content] of Object.entries(rootTree)) expect(after[rel]).toBe(content);
    expect(
      Object.keys(after).filter((k) => !k.startsWith("packages/api/") && !(k in rootTree)),
    ).toEqual([]);
  });
});

describe("interrupted runs", () => {
  it("never leaves a manifest claiming unapplied changes, and a rerun converges", async () => {
    const reference = await tempDir();
    await mkdir(reference, { recursive: true });
    await writeFile(path.join(reference, "CLAUDE.md"), "# Team\n");
    await kit(reference, ["init", "--preset", "base", "--context"]);
    const expected = await snapshotTree(reference);

    for (let killAt = 1; ; killAt++) {
      const root = await writeTree({ "CLAUDE.md": "# Team\n" });
      const run = await kit(root, ["init", "--preset", "base", "--context"], {
        AGENT_KIT_TEST_KILL_AT: String(killAt),
      });
      if (!wasKilled(run)) {
        expect(run.code).toBe(0);
        expect(killAt).toBeGreaterThan(3);
        break;
      }

      const interrupted = await snapshotTree(root);
      if (interrupted[".agent-kit/manifest.json"] !== undefined) {
        const manifest = JSON.parse(interrupted[".agent-kit/manifest.json"]);
        for (const entry of Object.values(manifest.items) as {
          files: { destination: string }[];
        }[]) {
          for (const f of entry.files) expect(interrupted[f.destination]).toBeDefined();
        }
      }

      const rerun = await kit(root, ["init", "--preset", "base", "--context"]);
      expect(rerun.code, `rerun after kill at step ${killAt}: ${rerun.stderr}`).toBe(0);
      // Directories created before the interruption cannot be attributed to agent-kit afterwards.
      const withoutDirs = (tree: Record<string, string>) => {
        const m = JSON.parse(tree[".agent-kit/manifest.json"]!);
        return { ...tree, ".agent-kit/manifest.json": { ...m, createdDirs: [] } };
      };
      expect(withoutDirs(await snapshotTree(root)), `after kill at step ${killAt}`).toEqual(
        withoutDirs(expected),
      );
    }
  }, 60_000);
});
