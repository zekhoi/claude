import { parse as parseToml } from "smol-toml";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/adapters/claude.js";
import { validateCodexFile } from "../src/adapters/codex.js";
import { invocationName, renderItem } from "../src/adapters/index.js";
import { planInstall, planUpdate, resolveSelection } from "../src/core/planner.js";
import {
  buildRegistry,
  loadPackagedRegistry,
  type PackagedRegistry,
} from "../src/core/registry.js";
import { PackagedItemSchema, type Manifest, type PackagedItem } from "../src/core/schemas.js";
import { rawHash, type FileState } from "../src/core/target.js";
import { fullRegistryFiles, tempDir, writeTree } from "./helpers.js";

const HASH = "0".repeat(64);
const agentItem = (): PackagedItem =>
  PackagedItemSchema.parse({
    schemaVersion: 1,
    id: "agent/reviewer",
    version: "1.0.0",
    type: "agent",
    description: "d",
    dependencies: [],
    files: [
      {
        source: "a.md",
        destination: ".claude/agents/kit-reviewer.md",
        install: "file",
        sha256: HASH,
      },
    ],
  });
const ruleItem = (): PackagedItem =>
  PackagedItemSchema.parse({
    schemaVersion: 1,
    id: "rule/web",
    version: "1.0.0",
    type: "rule",
    description: "d",
    dependencies: [],
    files: [
      {
        source: "r.md",
        destination: ".claude/rules/agent-kit/web.md",
        install: "file",
        sha256: HASH,
      },
    ],
  });

describe("review finding 1: control characters in Codex agent TOML", () => {
  it.each([
    ["form feed in the body", "x", "Step one\fStep two\n"],
    ["DEL in the body", "x", "Delete \u007f key\n"],
    ["DEL in the description", "bad \u007f desc", "Body\n"],
    ["escape sequence in the body", "x", "Colors: \u001b[31mred\u001b[0m\n"],
  ])("renders parseable TOML with %s", (_, description, body) => {
    const contents = new Map([
      [
        "a.md",
        `---\nname: kit-reviewer\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`,
      ],
    ]);
    const [file] = renderItem(agentItem(), contents, ["codex"]);
    const toml = parseToml(file!.content);
    expect(toml["developer_instructions"]).toBe(body);
    expect(toml["description"]).toBe(description);
    expect(validateCodexFile(agentItem(), file!)).toEqual([]);
  });

  it("rejects TOML that does not parse", () => {
    const broken = {
      destination: ".codex/agents/kit-x.toml",
      install: "file" as const,
      source: "a.md",
      content: 'name = "a\nunterminated',
    };
    expect(validateCodexFile(agentItem(), broken).map((d) => d.code)).toContain(
      "INVALID_FRONTMATTER",
    );
  });
});

describe("review finding 4: rule conversion", () => {
  const convert = (content: string) => {
    const [file] = renderItem(ruleItem(), new Map([["r.md", content]]), ["codex"]);
    return String(parseFrontmatter(file!.content)!["description"]);
  };

  it("ignores headings inside fenced code blocks", () => {
    const description = convert("Prefer small modules.\n\n```sh\n# install\nnpm ci\n```\n");
    expect(description.startsWith("web conventions for this project.")).toBe(true);
  });

  it("does not split brace globs in a string paths value", () => {
    const description = convert(
      '---\npaths: "src/**/*.{ts,tsx}, docs/**"\n---\n\n# Web conventions\n',
    );
    expect(description).toContain("`src/**/*.{ts,tsx}`, `docs/**`");
  });
});

describe("review finding 5: Codex agent names in any TOML style", () => {
  it.each(['name = "kit-reviewer"', "name='kit-reviewer'", '  name   =   "kit-reviewer"'])(
    "reads %s",
    (line) => {
      expect(invocationName(".codex/agents/mine.toml", `${line}\ndescription = "x"\n`)).toEqual({
        namespace: "Codex subagents",
        name: "kit-reviewer",
      });
    },
  );
});

describe("review findings 2 and 3: adding agents to existing installations", () => {
  let registry: PackagedRegistry;
  beforeAll(async () => {
    const out = path.join(await tempDir(), "registry");
    await buildRegistry(await writeTree(fullRegistryFiles()), out);
    registry = (await loadPackagedRegistry(out)).value!;
  });

  const file = (text: string): FileState => ({ state: "file", text, rawHash: rawHash(text) });
  const install = (
    agents: ("claude" | "codex")[],
    manifest?: Manifest,
    files: Record<string, FileState> = {},
    ids = ["preset/base"],
  ) => {
    const plan = planInstall({
      registry,
      manifest,
      files: new Map(Object.entries(files)),
      request: { ...resolveSelection(registry, ids).request!, context: false, agents },
      cliVersion: "1.0.0",
      contextTemplate: "",
    });
    const next = { ...files };
    for (const w of plan.writes) if (w.content !== null) next[w.destination] = file(w.content);
    return { plan, manifest: plan.manifest!, files: next };
  };

  it("skips retired items with a warning instead of blocking", () => {
    const base = install(["claude"]);
    base.manifest.items["skill/retired"] = {
      version: "1.0.0",
      files: [
        { destination: ".claude/skills/kit-retired/SKILL.md", install: "file", sha256: HASH },
      ],
    };
    const added = install(["codex"], base.manifest, base.files, []);
    expect(added.plan.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["ITEM_RETIRED", "warning"],
    ]);
    expect(added.plan.diagnostics[0]!.action).toContain("eject");
    expect(added.plan.writes.map((w) => w.destination)).toEqual([
      ".agents/skills/kit-review/SKILL.md",
    ]);
  });

  it("does not block on outdated items that only contribute the shared block", () => {
    const base = install(["claude"]);
    base.manifest.items["guideline/engineering"]!.version = "0.9.0";
    const added = install(["codex"], base.manifest, base.files, []);
    expect(added.plan.diagnostics).toEqual([]);
  });

  it("keeps the manifest stable after adding agents in either order", () => {
    const codexFirst = install(["codex"]);
    const both = install(["claude"], codexFirst.manifest, codexFirst.files, []);
    const update = planUpdate({
      registry,
      manifest: both.manifest,
      files: new Map(Object.entries(both.files)),
      cliVersion: "1.0.0",
      ids: [],
      allowMajor: false,
    });
    expect(update.writes).toEqual([]);
    expect(update.manifestChanged).toBe(false);
  });
});
