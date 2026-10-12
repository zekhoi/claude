import { describe, expect, it } from "vitest";
import { validateQuality } from "../src/core/quality.js";
import { RegistryItemSchema, type RegistryItem } from "../src/core/schemas.js";
import { item, SKILL_DESCRIPTION } from "./helpers.js";

const SKILL = ".claude/skills/kit-review/SKILL.md";
const REF = ".claude/skills/kit-review/references/checks.md";
const skill: RegistryItem = RegistryItemSchema.parse(
  item({
    files: [
      { source: "skills/review/SKILL.md", destination: SKILL },
      { source: "skills/review/checks.md", destination: REF },
    ],
  }),
);
const main = { source: "skills/review/SKILL.md", destination: SKILL };
const md = (body: string, description = SKILL_DESCRIPTION) =>
  `---\nname: kit-review\ndescription: ${description}\n---\n\n${body}\n`;
const codes = (content: string, file = main) =>
  validateQuality(skill, file, content).map((d) => d.code);

describe("validateQuality", () => {
  it("accepts finished content with resolvable links", () => {
    expect(
      codes(md("See [checks](references/checks.md#sql) and [docs](https://example.com).")),
    ).toEqual([]);
  });

  it.each(["TODO: finish", "FIXME later", "Lorem ipsum dolor", "Use <placeholder> here"])(
    "flags the placeholder %j",
    (body) => expect(codes(md(body))).toEqual(["PLACEHOLDER"]),
  );

  it("does not flag ordinary words that contain placeholder letters", () => {
    expect(codes(md("Avoid todos in commit messages; TODOs are fine in issues."))).toEqual([]);
  });

  it("flags links that would not resolve after installation", () => {
    expect(codes(md("See [missing](references/other.md)."))).toEqual(["BROKEN_REFERENCE"]);
    expect(codes(md("See [escape](../../settings.json)."))).toEqual(["BROKEN_REFERENCE"]);
  });

  it("resolves links relative to the file's installed location", () => {
    const ref = { source: "skills/review/checks.md", destination: REF };
    expect(codes("Back to [the skill](../SKILL.md).", ref)).toEqual([]);
  });

  it("requires skill descriptions to state when to use and skip the skill", () => {
    expect(codes(md("Body.", "Reviews code."))).toEqual(["TRIGGER_UNCLEAR"]);
    expect(codes(md("Body.", "Use when reviewing code."))).toEqual(["TRIGGER_UNCLEAR"]);
  });
});
