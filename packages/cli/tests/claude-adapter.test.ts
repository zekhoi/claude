import { describe, expect, it } from "vitest";
import { validateContent, validateDestination, validateItemFiles } from "../src/adapters/claude.js";
import { isSafeRelativePath } from "../src/core/paths.js";
import { RegistryItemSchema, type RegistryItem } from "../src/core/schemas.js";
import { item } from "./helpers.js";

const make = (o: Record<string, unknown> = {}): RegistryItem => RegistryItemSchema.parse(item(o));
const dest = (i: RegistryItem, destination: string, install: "file" | "managed-block" = "file") =>
  validateDestination(i, { source: "x.md", destination, install }).map((d) => d.code);

describe("isSafeRelativePath", () => {
  it.each(["/etc/passwd", "C:/x", "a\\b", "../x", "a/../b", "a//b", "./a", "", "a/\u0000"])(
    "rejects %j",
    (p) => expect(isSafeRelativePath(p)).toBe(false),
  );

  it("accepts nested relative paths", () => {
    expect(isSafeRelativePath(".claude/skills/kit-x/SKILL.md")).toBe(true);
  });
});

describe("validateDestination", () => {
  const skill = make();

  it("allows a skill's SKILL.md and supporting folders", () => {
    expect(dest(skill, ".claude/skills/kit-review/SKILL.md")).toEqual([]);
    expect(dest(skill, ".claude/skills/kit-review/references/checks.md")).toEqual([]);
    expect(dest(skill, ".claude/skills/kit-review/scripts/run.sh")).toEqual([]);
  });

  it("rejects destinations outside the item's own namespace", () => {
    expect(dest(skill, ".claude/skills/kit-other/SKILL.md")).toEqual(["DESTINATION_NOT_ALLOWED"]);
    expect(dest(skill, ".claude/skills/review/SKILL.md")).toEqual(["DESTINATION_NOT_ALLOWED"]);
    expect(dest(skill, ".claude/settings.json")).toEqual(["DESTINATION_NOT_ALLOWED"]);
    expect(dest(skill, ".claude/skills/kit-review/SKILL.md", "managed-block")).toEqual([
      "DESTINATION_NOT_ALLOWED",
    ]);
  });

  it("rejects traversal before checking the allowlist", () => {
    expect(dest(skill, ".claude/skills/kit-review/../../settings.json")).toEqual(["UNSAFE_PATH"]);
  });

  it("maps each item type to its fixed location", () => {
    const rule = make({ id: "rule/typescript", type: "rule" });
    expect(dest(rule, ".claude/rules/agent-kit/typescript.md")).toEqual([]);
    expect(dest(rule, ".claude/rules/typescript.md")).toEqual(["DESTINATION_NOT_ALLOWED"]);

    const agent = make({ id: "agent/debugger", type: "agent" });
    expect(dest(agent, ".claude/agents/kit-debugger.md")).toEqual([]);

    const guideline = make({ id: "guideline/engineering", type: "guideline" });
    expect(dest(guideline, "AGENTS.md", "managed-block")).toEqual([]);
    expect(dest(guideline, "AGENTS.md", "file")).toEqual(["DESTINATION_NOT_ALLOWED"]);
    expect(dest(guideline, "CLAUDE.md", "managed-block")).toEqual(["DESTINATION_NOT_ALLOWED"]);
  });

  it("requires every skill to install a SKILL.md", () => {
    const refsOnly = make({
      files: [{ source: "a.md", destination: ".claude/skills/kit-review/references/a.md" }],
    });
    expect(validateItemFiles(refsOnly).map((d) => d.code)).toEqual(["DESTINATION_NOT_ALLOWED"]);
  });
});

describe("validateContent", () => {
  const skill = make();
  const file = {
    source: "s.md",
    destination: ".claude/skills/kit-review/SKILL.md",
    install: "file" as const,
  };
  const codes = (content: string, i = skill, f = file) =>
    validateContent(i, f, content).map((d) => d.code);

  it("accepts matching kit- names and CRLF frontmatter", () => {
    expect(codes("---\r\nname: kit-review\r\ndescription: Review\r\n---\r\nBody")).toEqual([]);
  });

  it("requires frontmatter, the kit- name, and a description", () => {
    expect(codes("No frontmatter")).toEqual(["INVALID_FRONTMATTER"]);
    expect(codes("---\nname: review\ndescription: x\n---\n")).toEqual(["INVALID_FRONTMATTER"]);
    expect(codes("---\nname: kit-review\n---\n")).toEqual(["INVALID_FRONTMATTER"]);
  });

  it("enforces the skill description length limit", () => {
    expect(codes(`---\nname: kit-review\ndescription: ${"a".repeat(1537)}\n---\n`)).toEqual([
      "INVALID_FRONTMATTER",
    ]);
  });

  it("checks rule paths frontmatter shape when present", () => {
    const rule = make({ id: "rule/ts", type: "rule" });
    const rf = {
      source: "r.md",
      destination: ".claude/rules/agent-kit/ts.md",
      install: "file" as const,
    };
    expect(codes("Plain rule", rule, rf)).toEqual([]);
    expect(codes('---\npaths:\n  - "**/*.ts"\n---\n', rule, rf)).toEqual([]);
    expect(codes("---\npaths: 3\n---\n", rule, rf)).toEqual(["INVALID_FRONTMATTER"]);
  });
});
