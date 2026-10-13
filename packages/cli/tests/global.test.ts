import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderItem } from "../src/adapters/index.js";
import { PackagedItemSchema } from "../src/core/schemas.js";
import { homeEnv, kit, kitGlobal } from "./cli-helpers.js";
import { snapshotTree, tempDir, writeTree } from "./helpers.js";

const g = async (home: string, args: string[]) => {
  const run = await kit(home, args, homeEnv(home));
  return { ...run, result: args.includes("--json") ? JSON.parse(run.stdout) : undefined };
};
const global = kitGlobal;

describe("renderItem at user scope", () => {
  it("gives each agent its own guidelines file", () => {
    const item = PackagedItemSchema.parse({
      schemaVersion: 1,
      id: "guideline/engineering",
      version: "1.0.0",
      type: "guideline",
      description: "d",
      dependencies: [],
      files: [
        {
          source: "g.md",
          destination: "AGENTS.md",
          install: "managed-block",
          sha256: "0".repeat(64),
        },
      ],
    });
    const contents = new Map([["g.md", "## G"]]);
    expect(
      renderItem(item, contents, ["claude", "codex"], "user").map((f) => f.destination),
    ).toEqual([".claude/CLAUDE.md", ".codex/AGENTS.md"]);
    expect(renderItem(item, contents, ["claude", "codex"]).map((f) => f.destination)).toEqual([
      "AGENTS.md",
    ]);
  });
});

describe("global installation", () => {
  it("installs into the home directory for both agents without project files", async () => {
    const home = await tempDir();
    expect(
      (await global(home, ["init", "--preset", "node", "--agent", "claude", "--agent", "codex"]))
        .code,
    ).toBe(0);
    const tree = await snapshotTree(home);
    expect(tree[".claude/CLAUDE.md"]).toContain("## Engineering guidelines");
    expect(tree[".codex/AGENTS.md"]).toContain("## Engineering guidelines");
    expect(tree[".claude/rules/agent-kit/typescript.md"]).toBeDefined();
    expect(tree[".agents/skills/kit-typescript-rules/SKILL.md"]).toBeDefined();
    expect(tree["AGENTS.md"]).toBeUndefined();
    expect(tree["CLAUDE.md"]).toBeUndefined();
    const manifest = JSON.parse(tree[".agent-kit/manifest.json"]!);
    expect(manifest).toMatchObject({ scope: "user", agents: ["claude", "codex"] });
    expect(manifest.claudeImport).toBeUndefined();

    const again = await global(home, ["init", "--preset", "node", "--json"]);
    expect(again.code).toBe(0);
    expect(JSON.parse(again.stdout).data.applied).toBe(false);
    expect((await global(home, ["doctor"])).code).toBe(0);
  });

  it("keeps existing user instructions and restores them on uninstall", async () => {
    const home = await writeTree({
      ".claude/CLAUDE.md": "# My global notes\n",
      ".claude/settings.json": "{}\n",
    });
    const before = await snapshotTree(home);
    expect((await global(home, ["init", "--preset", "base"])).code).toBe(0);
    const claude = await readFile(path.join(home, ".claude/CLAUDE.md"), "utf8");
    expect(claude.startsWith("# My global notes\n")).toBe(true);
    expect(claude).toContain("<!-- agent-kit:start -->");
    expect((await global(home, ["uninstall"])).code).toBe(0);
    expect(await snapshotTree(home)).toEqual(before);
  });

  it("adds Codex to a global Claude installation with its own guidelines block", async () => {
    const home = await tempDir();
    await global(home, ["init", "--preset", "base"]);
    const added = await global(home, ["init", "--agent", "codex"]);
    expect(added.code, added.stderr).toBe(0);
    const tree = await snapshotTree(home);
    expect(tree[".codex/AGENTS.md"]).toContain("## Engineering guidelines");
    expect(tree[".agents/skills/kit-commit/SKILL.md"]).toBeDefined();
  });

  it("removes and ejects guidelines in every agent's file", async () => {
    const home = await tempDir();
    await global(home, ["init", "--preset", "base", "--agent", "claude", "--agent", "codex"]);
    await writeFile(path.join(home, "keep.txt"), "x");
    expect((await global(home, ["eject", "guideline/engineering"])).code).toBe(0);
    const tree = await snapshotTree(home);
    for (const file of [".claude/CLAUDE.md", ".codex/AGENTS.md"]) {
      expect(tree[file]).toContain("## Engineering guidelines");
      expect(tree[file]).not.toContain("agent-kit:start");
    }
  });

  it("refuses to mix project and global installations", async () => {
    const home = await tempDir();
    await global(home, ["init", "--preset", "base"]);
    const project = await g(home, ["status", "--json"]);
    expect(project.code).toBe(1);
    expect(project.result.diagnostics[0].code).toBe("SCOPE_MISMATCH");

    const other = await tempDir();
    await g(other, ["init", "--preset", "base"]);
    const wrong = await global(other, ["status"]);
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain("SCOPE_MISMATCH");
  });

  it("rejects --cwd and --context with --global", async () => {
    const home = await tempDir();
    expect((await g(home, ["init", "--global", "--preset", "base"])).stderr).toContain(
      "cannot be used with option '--cwd",
    );
    expect((await global(home, ["init", "--preset", "base", "--context"])).stderr).toContain(
      "cannot be used with option '--context'",
    );
    expect(await snapshotTree(home)).toEqual({});
  });

  it("refuses relocated configuration directories for the agents involved", async () => {
    const home = await tempDir();
    const moved = await global(home, ["init", "--preset", "base", "--agent", "codex"], {
      CODEX_HOME: "/elsewhere/codex",
    });
    expect(moved.code).toBe(1);
    expect(moved.stderr).toContain("CODEX_HOME relocates");
    expect(await snapshotTree(home)).toEqual({});

    const claudeOnly = await global(home, ["init", "--preset", "base"], {
      CODEX_HOME: "/elsewhere/codex",
    });
    expect(claudeOnly.code).toBe(0);
    const sameDir = await global(home, ["init", "--agent", "codex"], {
      CODEX_HOME: path.join(home, ".codex"),
    });
    expect(sameDir.code, sameDir.stderr).toBe(0);
  });
});

describe("doctor and overlapping scopes", () => {
  it("warns about items installed both in a project and globally", async () => {
    const home = await tempDir();
    await global(home, ["init", "--preset", "base"]);
    const project = await tempDir();
    await kit(project, ["init", "--preset", "base"], homeEnv(home));
    await kit(project, ["add", "agent/reviewer"], homeEnv(home));
    await global(home, ["add", "agent/reviewer"]);

    const run = await kit(project, ["doctor", "--json"], homeEnv(home));
    expect(run.code).toBe(0);
    const diagnostics = JSON.parse(run.stdout).diagnostics as {
      code: string;
      message: string;
      action: string;
    }[];
    const overlap = diagnostics.filter((d) => d.code === "SCOPE_OVERLAP");
    const byId = (id: string) => overlap.find((d) => d.message.startsWith(id))!;
    expect(byId("skill/code-review").message).toContain("uses the global copy");
    expect(byId("agent/reviewer").message).toContain("uses this project's copy");
    expect(byId("rule/testing").message).toContain("apply twice");
    expect(byId("guideline/engineering").action).toContain(
      "agent-kit remove guideline/engineering --global",
    );
  });

  it("reports nothing when the scopes do not overlap", async () => {
    const home = await tempDir();
    await global(home, ["add", "skill/database-design"]);
    const project = await tempDir();
    await kit(project, ["init", "--preset", "base"], homeEnv(home));
    const run = await kit(project, ["doctor", "--json"], homeEnv(home));
    expect(JSON.parse(run.stdout).diagnostics).toEqual([]);
    expect((await global(home, ["doctor"])).code).toBe(0);
  });
});

describe("doctor in a monorepo", () => {
  it("warns about items also installed at the repository root, up to the git root only", async () => {
    const home = await tempDir();
    const outer = await tempDir();
    const repo = path.join(outer, "repo");
    const pkg = path.join(repo, "packages/api");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(repo, ".git"), { recursive: true });
    await mkdir(pkg, { recursive: true });
    // An installation above the git root belongs to another repository and is ignored.
    await kit(outer, ["add", "skill/refactoring"], homeEnv(home));
    await kit(repo, ["init", "--preset", "base"], homeEnv(home));
    await kit(
      pkg,
      ["add", "skill/code-review", "skill/debugging", "skill/refactoring"],
      homeEnv(home),
    );

    const run = await kit(pkg, ["doctor", "--json"], homeEnv(home));
    expect(run.code).toBe(0);
    const overlap = (
      JSON.parse(run.stdout).diagnostics as { code: string; message: string; action: string }[]
    ).filter((d) => d.code === "SCOPE_OVERLAP");
    expect(overlap.map((d) => d.message.split(" ")[0])).toEqual([
      "skill/code-review",
      "skill/debugging",
    ]);
    expect(overlap[0]!.message).toContain("enclosing project ../..");
    expect(overlap[0]!.action).toContain("agent-kit remove skill/code-review --cwd ../..");

    // The root installation does not scan into packages.
    expect(
      JSON.parse((await kit(repo, ["doctor", "--json"], homeEnv(home))).stdout).diagnostics,
    ).toEqual([]);
  });
});
