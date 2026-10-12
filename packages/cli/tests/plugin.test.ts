import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/adapters/claude.js";
import { renderPlugin } from "../src/adapters/plugin.js";
import { PackagedItemSchema, type PackagedItem } from "../src/core/schemas.js";

const HASH = "0".repeat(64);
const item = (
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

describe("renderPlugin", () => {
  it("drops the kit- prefix and rewrites references to catalog names", () => {
    const skill = item("skill/pull-request", [
      { source: "s.md", destination: ".claude/skills/kit-pull-request/SKILL.md" },
      { source: "r.md", destination: ".claude/skills/kit-pull-request/references/r.md" },
    ]);
    const contents = new Map([
      [
        "s.md",
        "---\nname: kit-pull-request\ndescription: Open PRs. Do not use for reviews (use kit-code-review).\n---\n\nUse kit-code-review, not kit-code-reviewer or the agent-kit CLI.\n",
      ],
      ["r.md", "kit-code-review stays as written in references"],
    ]);
    const [main, ref] = renderPlugin(skill, contents, ["pull-request", "code-review"]);
    expect(main!.path).toBe("skills/pull-request/SKILL.md");
    const fm = parseFrontmatter(main!.content)!;
    expect(fm["name"]).toBe("pull-request");
    expect(fm["description"]).toContain("(use agent-kit:code-review)");
    expect(main!.content).toContain(
      "Use agent-kit:code-review, not kit-code-reviewer or the agent-kit CLI.",
    );
    expect(ref).toEqual({
      path: "skills/pull-request/references/r.md",
      content: "kit-code-review stays as written in references",
    });
  });

  it("renders agents, rules, and the guidelines as plugin components", () => {
    const agent = item("agent/reviewer", [
      { source: "a.md", destination: ".claude/agents/kit-reviewer.md" },
    ]);
    const rule = item("rule/typescript", [
      { source: "t.md", destination: ".claude/rules/agent-kit/typescript.md" },
    ]);
    const guideline = item("guideline/engineering", [
      { source: "g.md", destination: "AGENTS.md", install: "managed-block" },
    ]);
    const contents = new Map([
      ["a.md", "---\nname: kit-reviewer\ndescription: Reviews\ntools: Read\n---\n\nReview.\n"],
      ["t.md", '---\npaths:\n  - "**/*.ts"\n---\n\n# TypeScript conventions\n'],
      ["g.md", "## Engineering guidelines\n"],
    ]);
    const [a] = renderPlugin(agent, contents, ["reviewer"]);
    expect(a!.path).toBe("agents/reviewer.md");
    expect(parseFrontmatter(a!.content)).toMatchObject({ name: "reviewer", tools: "Read" });

    const [r] = renderPlugin(rule, contents, []);
    expect(r!.path).toBe("skills/typescript-rules/SKILL.md");
    expect(parseFrontmatter(r!.content)!["name"]).toBe("typescript-rules");
    expect(String(parseFrontmatter(r!.content)!["description"])).toContain("`**/*.ts`");

    const [g] = renderPlugin(guideline, contents, []);
    expect(g!.path).toBe("skills/engineering-guidelines/SKILL.md");
    expect(String(parseFrontmatter(g!.content)!["description"])).toMatch(/Use when .* Do not use/);
    expect(g!.content).toContain("## Engineering guidelines");
  });
});
