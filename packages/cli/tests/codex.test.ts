import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/adapters/claude.js";
import { validateCodexFile } from "../src/adapters/codex.js";
import { renderItem, type RenderedFile } from "../src/adapters/index.js";
import { PackagedItemSchema, type PackagedItem } from "../src/core/schemas.js";

const HASH = "0".repeat(64);
const make = (o: Record<string, unknown>): PackagedItem =>
  PackagedItemSchema.parse({
    schemaVersion: 1,
    version: "1.2.3",
    description: "d",
    dependencies: [],
    ...o,
  });

const agent = (tools: string, body = "You review code.\n\nReport findings.\n") => ({
  item: make({
    id: "agent/reviewer",
    type: "agent",
    files: [
      {
        source: "a.md",
        destination: ".claude/agents/kit-reviewer.md",
        install: "file",
        sha256: HASH,
      },
    ],
  }),
  contents: new Map([
    [
      "a.md",
      `---\nname: kit-reviewer\ndescription: Reviews "carefully"\ntools: ${tools}\n---\n\n${body}`,
    ],
  ]),
});

const codex = (item: PackagedItem, contents: Map<string, string>): RenderedFile[] =>
  renderItem(item, contents, ["codex"]);

describe("renderCodex", () => {
  it("renders subagents as valid TOML with the prompt as developer_instructions", () => {
    const { item, contents } = agent("Read, Grep, Glob, Bash");
    const [file] = codex(item, contents);
    expect(file!.destination).toBe(".codex/agents/kit-reviewer.toml");
    const toml = parseToml(file!.content);
    expect(toml).toEqual({
      name: "kit-reviewer",
      description: 'Reviews "carefully"',
      sandbox_mode: "read-only",
      developer_instructions: "You review code.\n\nReport findings.\n",
    });
  });

  it("keeps the default sandbox for agents that can edit files", () => {
    const { item, contents } = agent("Read, Edit, Bash");
    expect(parseToml(codex(item, contents)[0]!.content)).not.toHaveProperty("sandbox_mode");
  });

  it("falls back to an escaped string when instructions contain triple quotes", () => {
    const body = "Never write ''' in TOML.\nUse \\ carefully.\n";
    const { item, contents } = agent("Read", body);
    expect(parseToml(codex(item, contents)[0]!.content)["developer_instructions"]).toBe(body);
  });

  it("copies skills unchanged into .agents/skills", () => {
    const item = make({
      id: "skill/review",
      type: "skill",
      files: [
        {
          source: "s.md",
          destination: ".claude/skills/kit-review/SKILL.md",
          install: "file",
          sha256: HASH,
        },
        {
          source: "r.md",
          destination: ".claude/skills/kit-review/references/r.md",
          install: "file",
          sha256: HASH,
        },
      ],
    });
    const contents = new Map([
      ["s.md", "---\nname: kit-review\ndescription: x\n---\nBody\n"],
      ["r.md", "ref"],
    ]);
    expect(codex(item, contents).map((f) => [f.destination, f.content])).toEqual([
      [".agents/skills/kit-review/SKILL.md", contents.get("s.md")],
      [".agents/skills/kit-review/references/r.md", "ref"],
    ]);
  });

  it("turns path-scoped rules into skills that name the files they apply to", () => {
    const item = make({
      id: "rule/typescript",
      type: "rule",
      files: [
        {
          source: "t.md",
          destination: ".claude/rules/agent-kit/typescript.md",
          install: "file",
          sha256: HASH,
        },
      ],
    });
    const contents = new Map([
      [
        "t.md",
        '---\npaths:\n  - "**/*.ts"\n  - "**/*.tsx"\n---\n\n# TypeScript conventions\n\n- Avoid any.\n',
      ],
    ]);
    const [file] = codex(item, contents);
    expect(file!.destination).toBe(".agents/skills/kit-typescript-rules/SKILL.md");
    const fm = parseFrontmatter(file!.content)!;
    expect(fm["name"]).toBe("kit-typescript-rules");
    expect(fm["description"]).toBe(
      "TypeScript conventions for this project. Use when reading, writing, or reviewing files matching `**/*.ts`, `**/*.tsx`. Do not use for other files.",
    );
    expect(file!.content).toContain("\n# TypeScript conventions\n\n- Avoid any.\n");
    expect(file!.content).not.toContain("paths:");
  });

  it("renders unscoped rules as project-wide skills", () => {
    const item = make({
      id: "rule/style",
      type: "rule",
      files: [
        {
          source: "s.md",
          destination: ".claude/rules/agent-kit/style.md",
          install: "file",
          sha256: HASH,
        },
      ],
    });
    const [file] = codex(item, new Map([["s.md", "Prefer small functions.\n"]]));
    expect(parseFrontmatter(file!.content)!["description"]).toContain(
      "Use for any change in this project.",
    );
  });

  it("shares the AGENTS.md block between agents", () => {
    const item = make({
      id: "guideline/engineering",
      type: "guideline",
      files: [{ source: "g.md", destination: "AGENTS.md", install: "managed-block", sha256: HASH }],
    });
    const files = renderItem(item, new Map([["g.md", "## G"]]), ["claude", "codex"]);
    expect(files.map((f) => f.destination)).toEqual(["AGENTS.md"]);
  });
});

describe("validateCodexFile", () => {
  const item = make({
    id: "skill/x",
    type: "skill",
    files: [
      {
        source: "s.md",
        destination: ".claude/skills/kit-x/SKILL.md",
        install: "file",
        sha256: HASH,
      },
    ],
  });
  const skill = (fm: string) => ({
    destination: ".agents/skills/kit-x/SKILL.md",
    install: "file" as const,
    source: "s.md",
    content: `---\n${fm}\n---\nBody\n`,
  });
  const codes = (file: RenderedFile) => validateCodexFile(item, file).map((d) => d.code);

  it("enforces Codex skill name and description limits", () => {
    expect(codes(skill("name: kit-x\ndescription: ok"))).toEqual([]);
    expect(codes(skill(`name: kit-${"x".repeat(70)}\ndescription: ok`))).toEqual([
      "INVALID_FRONTMATTER",
    ]);
    expect(codes(skill(`name: kit-x\ndescription: ${"d".repeat(1025)}`))).toEqual([
      "INVALID_FRONTMATTER",
    ]);
  });

  it("requires the TOML agent keys", () => {
    const toml = (text: string) => ({
      destination: ".codex/agents/kit-x.toml",
      install: "file" as const,
      source: "a.md",
      content: text,
    });
    expect(codes(toml('name = "a"\ndescription = "b"\ndeveloper_instructions = "c"\n'))).toEqual(
      [],
    );
    expect(codes(toml('name = "a"\ndescription = ""\ndeveloper_instructions = "c"\n'))).toEqual([
      "INVALID_FRONTMATTER",
    ]);
    expect(codes(toml('name = "a"\n'))).toHaveLength(2);
  });
});
