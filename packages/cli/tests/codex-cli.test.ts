import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { codesOf, json, kit } from "./cli-helpers.js";
import { snapshotTree, tempDir, writeTree } from "./helpers.js";

const codexInstall = async (files: Record<string, string> = {}) => {
  const root = Object.keys(files).length ? await writeTree(files) : await tempDir();
  const run = await kit(root, ["init", "--preset", "node", "--agent", "codex"]);
  expect(run.code, run.stderr).toBe(0);
  return root;
};

describe("Codex installations", () => {
  it("installs skills, converted rules, and the AGENTS.md block, without CLAUDE.md", async () => {
    const root = await codexInstall();
    const tree = await snapshotTree(root);
    expect(
      Object.keys(tree)
        .filter((k) => !k.endsWith("/"))
        .sort(),
    ).toEqual([
      ".agent-kit/manifest.json",
      ".agents/skills/kit-code-review/SKILL.md",
      ".agents/skills/kit-commit/SKILL.md",
      ".agents/skills/kit-debugging/SKILL.md",
      ".agents/skills/kit-fastify-api/SKILL.md",
      ".agents/skills/kit-feature-implementation/SKILL.md",
      ".agents/skills/kit-kysely-review/SKILL.md",
      ".agents/skills/kit-pull-request/SKILL.md",
      ".agents/skills/kit-testing-rules/SKILL.md",
      ".agents/skills/kit-typescript-rules/SKILL.md",
      "AGENTS.md",
    ]);
    expect(tree[".agents/skills/kit-typescript-rules/SKILL.md"]).toContain("`**/*.ts`");
    expect(JSON.parse(tree[".agent-kit/manifest.json"]!).agents).toEqual(["codex"]);
  });

  it("installs subagents as TOML and reports a healthy installation", async () => {
    const root = await codexInstall();
    expect((await kit(root, ["add", "agent/reviewer", "agent/debugger"])).code).toBe(0);
    const reviewer = parseToml(
      await readFile(path.join(root, ".codex/agents/kit-reviewer.toml"), "utf8"),
    );
    expect(reviewer).toMatchObject({ name: "kit-reviewer", sandbox_mode: "read-only" });
    expect(String(reviewer["developer_instructions"])).toContain("You are a code reviewer");

    const doctor = await json(root, ["doctor"]);
    expect(doctor.code).toBe(0);
    expect(doctor.result.diagnostics).toEqual([]);
    const status = await json(root, ["status"]);
    const states = status.result.data.status.items.flatMap((i: { files: { status: string }[] }) =>
      i.files.map((f) => f.status),
    );
    expect(new Set(states)).toEqual(new Set(["ok"]));
  });

  it("adds Claude Code to a Codex installation and back out again", async () => {
    const root = await codexInstall({ "README.md": "# App\n" });
    const before = await snapshotTree(root);
    const added = await json(root, ["init", "--agent", "claude"]);
    expect(added.code, JSON.stringify(added.result.diagnostics)).toBe(0);
    const tree = await snapshotTree(root);
    expect(tree["CLAUDE.md"]).toContain("@AGENTS.md");
    expect(tree[".claude/skills/kit-code-review/SKILL.md"]).toBe(
      tree[".agents/skills/kit-code-review/SKILL.md"],
    );
    expect(tree[".claude/rules/agent-kit/typescript.md"]).toContain("paths:");
    for (const [rel, content] of Object.entries(before)) {
      if (rel !== ".agent-kit/manifest.json") expect(tree[rel]).toBe(content);
    }

    expect((await kit(root, ["uninstall"])).code).toBe(0);
    expect(await snapshotTree(root)).toEqual({ "README.md": "# App\n" });
  });

  it("previews converted files with show --diff", async () => {
    const root = await codexInstall();
    const clean = await json(root, ["show", "rule/typescript", "--diff"]);
    expect(clean.result.data.files).toEqual([
      expect.objectContaining({
        destination: ".agents/skills/kit-typescript-rules/SKILL.md",
        local: "identical",
      }),
    ]);
  });

  it("reports other Codex skills that reuse an installed name", async () => {
    const root = await codexInstall();
    await mkdir(path.join(root, ".agents/skills/my-debugging"), { recursive: true });
    await writeFile(
      path.join(root, ".agents/skills/my-debugging/SKILL.md"),
      "---\nname: kit-debugging\ndescription: Mine\n---\n",
    );
    const run = await json(root, ["doctor"]);
    expect(run.code).toBe(1);
    expect(codesOf(run.result)).toEqual(["NAME_COLLISION"]);
  });

  it("rejects unknown agents before doing anything", async () => {
    const root = await tempDir();
    const run = await kit(root, ["init", "--preset", "base", "--agent", "cursor"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("expected one of: claude, codex");
    expect(await snapshotTree(root)).toEqual({});
  });
});
