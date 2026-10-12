import { parse as parseToml } from "smol-toml";
import { error, type Diagnostic } from "../core/diagnostics.js";
import type { PackagedItem } from "../core/schemas.js";
import { AGENTS_MD, NAME_PREFIX, parseFrontmatter } from "./claude.js";
import type { RenderedFile } from "./index.js";

/**
 * Codex mapping (https://learn.chatgpt.com/docs/build-skills, .../agent-configuration/subagents,
 * .../agent-configuration/agents-md):
 * - AGENTS.md is read natively, so the guidelines block is shared with Claude Code.
 * - Skills use the same SKILL.md format under `.agents/skills/`, which needs no project trust.
 * - Subagents are TOML files under `.codex/agents/`; they load only in trusted projects.
 * - Codex has no path-scoped instruction rules (its "rules" govern shell commands), so each
 *   rule becomes a skill whose description names the files it applies to.
 */
export const CODEX_SKILLS_DIR = ".agents/skills";
export const CODEX_AGENTS_DIR = ".codex/agents";
/** Codex limits skill names to 64 characters; descriptions are kept under 1,024 to be safe. */
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
/** Claude Code tools that can modify files; an agent without them maps to a read-only sandbox. */
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

function itemName(item: PackagedItem): string {
  return item.id.slice(item.id.indexOf("/") + 1);
}

/** Splits leading YAML frontmatter from the body. */
function splitFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const normalized = content.replace(/\r\n?/g, "\n");
  const match = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(normalized);
  return {
    data: parseFrontmatter(normalized) ?? {},
    body: (match ? normalized.slice(match[0].length) : normalized).replace(/^\n+/, ""),
  };
}

/** Control characters TOML forbids unescaped in strings (everything but tab and newline). */
// eslint-disable-next-line no-control-regex
const TOML_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/**
 * A TOML basic string. JSON escapes are a subset of TOML's, but JSON leaves DEL unescaped,
 * which TOML forbids.
 */
function tomlString(value: string): string {
  return JSON.stringify(value).replace(/\u007f/g, "\\u007f");
}

/** A TOML multi-line literal string when possible, so instructions stay readable. */
function tomlMultiline(value: string): string {
  const text = value.endsWith("\n") ? value : `${value}\n`;
  return text.includes("'''") || TOML_CONTROL.test(text) ? tomlString(text) : `'''\n${text}'''`;
}

/** Strips fenced code blocks so their contents are not mistaken for headings. */
function withoutFences(markdown: string): string {
  return markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
}

/** Splits comma-separated globs, keeping commas inside braces such as `*.{ts,tsx}`. */
function splitGlobs(value: string): string[] {
  const globs: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "{") depth++;
    if (ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      globs.push(current);
      current = "";
    } else current += ch;
  }
  globs.push(current);
  return globs.map((g) => g.trim()).filter(Boolean);
}

function agentToml(item: PackagedItem, content: string): string {
  const { data, body } = splitFrontmatter(content);
  const tools =
    typeof data["tools"] === "string"
      ? data["tools"].split(",").map((t) => t.trim())
      : Array.isArray(data["tools"])
        ? data["tools"].map(String)
        : undefined;
  const readOnly = tools !== undefined && !tools.some((t) => WRITE_TOOLS.has(t));
  const lines = [
    `# Installed by agent-kit from ${item.id} ${item.version}. Local edits stop updates to this file.`,
    `name = ${tomlString(`${NAME_PREFIX}${itemName(item)}`)}`,
    `description = ${tomlString(String(data["description"] ?? "").trim())}`,
  ];
  if (readOnly) lines.push(`sandbox_mode = "read-only"`);
  lines.push(`developer_instructions = ${tomlMultiline(body)}`);
  return `${lines.join("\n")}\n`;
}

function ruleSkill(item: PackagedItem, content: string): string {
  const { data, body } = splitFrontmatter(content);
  const raw = data["paths"];
  const globs =
    typeof raw === "string" ? splitGlobs(raw) : Array.isArray(raw) ? raw.map(String) : [];
  const title =
    /^#[ \t]+(.+)$/m.exec(withoutFences(body))?.[1]?.trim() ?? `${itemName(item)} conventions`;
  const scope =
    globs.length > 0
      ? `Use when reading, writing, or reviewing files matching ${globs.map((g) => `\`${g}\``).join(", ")}. Do not use for other files.`
      : "Use for any change in this project. Do not use outside this project.";
  const frontmatter = [
    "---",
    `name: ${NAME_PREFIX}${itemName(item)}-rules`,
    `description: ${JSON.stringify(`${title} for this project. ${scope}`)}`,
    "---",
    "",
  ].join("\n");
  return `${frontmatter}\n${body}`;
}

/** Renders an item for Codex. Destinations come from the item's canonical (Claude) layout. */
export function renderCodex(
  item: PackagedItem,
  contents: ReadonlyMap<string, string>,
): RenderedFile[] {
  return item.files.map((file) => {
    const content = contents.get(file.source)!;
    const base = { source: file.source, install: file.install };
    switch (item.type) {
      case "guideline":
        return { ...base, destination: AGENTS_MD, content };
      case "skill":
        return {
          ...base,
          destination: file.destination.replace(/^\.claude\/skills\//, `${CODEX_SKILLS_DIR}/`),
          content,
        };
      case "agent":
        return {
          ...base,
          destination: `${CODEX_AGENTS_DIR}/${NAME_PREFIX}${itemName(item)}.toml`,
          content: agentToml(item, content),
        };
      case "rule":
        return {
          ...base,
          destination: `${CODEX_SKILLS_DIR}/${NAME_PREFIX}${itemName(item)}-rules/SKILL.md`,
          content: ruleSkill(item, content),
        };
    }
  });
}

/** Checks rendered Codex files against the documented format constraints. */
export function validateCodexFile(item: PackagedItem, file: RenderedFile): Diagnostic[] {
  const at = {
    path: file.source,
    action: `Rendering ${item.id} for Codex produced ${file.destination}`,
  };
  if (file.destination.endsWith("/SKILL.md")) {
    const fm = parseFrontmatter(file.content);
    const name = fm?.["name"];
    const description = fm?.["description"];
    const problems: string[] = [];
    if (typeof name !== "string" || name.length === 0 || name.length > NAME_MAX) {
      problems.push(`skill name must be 1-${NAME_MAX} characters`);
    }
    if (typeof description !== "string" || description.trim() === "") {
      problems.push("skill description is required");
    } else if (description.length > DESCRIPTION_MAX) {
      problems.push(`skill description exceeds ${DESCRIPTION_MAX} characters`);
    }
    return problems.map((p) => error("INVALID_FRONTMATTER", `Codex: ${p}`, at));
  }
  if (file.destination.endsWith(".toml")) {
    let data: Record<string, unknown>;
    try {
      data = parseToml(file.content);
    } catch (e) {
      return [
        error(
          "INVALID_FRONTMATTER",
          `Codex: agent file is not valid TOML: ${(e as Error).message.split("\n")[0]}`,
          at,
        ),
      ];
    }
    return ["name", "description", "developer_instructions"]
      .filter((key) => typeof data[key] !== "string" || String(data[key]).trim() === "")
      .map((key) => error("INVALID_FRONTMATTER", `Codex: agent ${key} is missing or empty`, at));
  }
  return [];
}
