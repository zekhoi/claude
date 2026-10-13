import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/adapters/claude.js";
import { renderPlugin } from "../src/adapters/plugin.js";
import { checkScope } from "../src/core/scope.js";
import { PackagedItemSchema, type PackagedItem } from "../src/core/schemas.js";
import { kit } from "./cli-helpers.js";
import { tempDir } from "./helpers.js";

const HASH = "0".repeat(64);
const make = (
  id: string,
  files: { source: string; destination: string; install?: string }[],
): PackagedItem =>
  PackagedItemSchema.parse({
    schemaVersion: 1,
    id,
    version: "1.0.0",
    type: id.split("/")[0],
    description: "d",
    dependencies: [],
    files: files.map((f) => ({ install: "file", sha256: HASH, ...f })),
  });

describe("review finding 1: plugin reference rewriting", () => {
  const names = ["code-review", "commit", "testing-rules"];
  const skill = make("skill/pull-request", [
    { source: "s.md", destination: ".claude/skills/kit-pull-request/SKILL.md" },
    { source: "r.md", destination: ".claude/skills/kit-pull-request/references/r.md" },
  ]);

  it("rewrites only standalone references", () => {
    const contents = new Map([
      [
        "s.md",
        "---\nname: kit-pull-request\ndescription: d\n---\n\nUse kit-commit and kit-testing-rules. Keep agent-kit-commit, .claude/skills/kit-code-review/SKILL.md, and kit-commits.\n",
      ],
      ["r.md", "See kit-code-review."],
    ]);
    const [main, ref] = renderPlugin(skill, contents, names);
    expect(main!.content).toContain("Use agent-kit:commit and agent-kit:testing-rules.");
    expect(main!.content).toContain(
      "Keep agent-kit-commit, .claude/skills/kit-code-review/SKILL.md, and kit-commits.",
    );
    expect(ref!.content).toBe("See agent-kit:code-review.");
  });

  it("rewrites references in the guidelines and rule bodies too", () => {
    const guideline = make("guideline/engineering", [
      { source: "g.md", destination: "AGENTS.md", install: "managed-block" },
    ]);
    const rule = make("rule/testing", [
      { source: "t.md", destination: ".claude/rules/agent-kit/testing.md" },
    ]);
    const contents = new Map([
      ["g.md", "Review with kit-code-review."],
      ["t.md", "# Testing conventions\n\nCommit with kit-commit.\n"],
    ]);
    expect(renderPlugin(guideline, contents, names)[0]!.content).toContain(
      "Review with agent-kit:code-review.",
    );
    expect(renderPlugin(rule, contents, names)[0]!.content).toContain(
      "Commit with agent-kit:commit.",
    );
  });
});

describe("review finding 2: frontmatter name replacement", () => {
  const agent = make("agent/reviewer", [
    { source: "a.md", destination: ".claude/agents/kit-reviewer.md" },
  ]);

  it("never touches body text", () => {
    const withoutName = "---\ndescription: d\n---\n\n```yaml\nname: my-service\n```\n";
    const out = renderPlugin(agent, new Map([["a.md", withoutName]]), [])[0]!.content;
    expect(out).toContain("name: my-service");
    expect(parseFrontmatter(out)!["name"]).toBe("reviewer");

    const noFrontmatter = "# T\n\n---\n\nname: foo\n";
    expect(renderPlugin(agent, new Map([["a.md", noFrontmatter]]), [])[0]!.content).toContain(
      "name: foo",
    );
  });

  it("handles CRLF frontmatter", () => {
    const crlf = "---\r\nname: kit-reviewer\r\ndescription: d\r\n---\r\n\r\nBody\r\n";
    expect(
      parseFrontmatter(renderPlugin(agent, new Map([["a.md", crlf]]), [])[0]!.content)!["name"],
    ).toBe("reviewer");
  });
});

describe("review finding 3: doctor on a scope mismatch", () => {
  it("does not claim agent-kit is missing", async () => {
    const home = await tempDir();
    const env = { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: "", CODEX_HOME: "" };
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { fileURLToPath } = await import("node:url");
    const bin = fileURLToPath(new URL("../dist/index.js", import.meta.url));
    await promisify(execFile)(process.execPath, [bin, "init", "--preset", "base", "--global"], {
      env: { ...process.env, ...env },
    });
    const run = await kit(home, ["doctor", "--json"], env);
    const result = JSON.parse(run.stdout);
    expect(run.code).toBe(1);
    expect(result.diagnostics[0].code).toBe("SCOPE_MISMATCH");
    expect(result.data.installed).toBe(true);
    const human = await kit(home, ["doctor"], env);
    expect(human.stdout).not.toContain("not installed");
  });
});

describe("review finding 4: relocated directory comparison", () => {
  it("accepts the default directory written as ~, with a trailing slash, or through a symlink", async () => {
    const home = await tempDir();
    await mkdir(path.join(home, ".claude"));
    const check = (value: string) =>
      checkScope(undefined, "user", ["claude"], { CLAUDE_CONFIG_DIR: value }, home);
    expect(check("~/.claude")).toEqual([]);
    expect(check(`${home}/.claude/`)).toEqual([]);
    const link = path.join(await tempDir(), "claude-link");
    await symlink(path.join(home, ".claude"), link);
    expect(check(link)).toEqual([]);
  });

  it("still refuses a genuinely different directory", async () => {
    const home = await tempDir();
    expect(
      checkScope(undefined, "user", ["codex"], { CODEX_HOME: "/elsewhere/codex" }, home)[0]?.code,
    ).toBe("TARGET_INVALID");
  });
});
