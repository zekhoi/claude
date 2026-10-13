import type { PackagedItem } from "../core/schemas.js";
import { NAME_PREFIX } from "./claude.js";
import { ruleSkill, splitFrontmatter } from "./codex.js";

/**
 * Claude Code plugin layout (https://code.claude.com/docs/en/plugins/manifest-reference).
 * Plugin components are namespaced by the plugin (`/agent-kit:code-review`), so the `kit-`
 * prefix is dropped. Plugins cannot ship CLAUDE.md content or path-scoped rules, so the
 * guidelines and each rule become skills.
 */
export const PLUGIN_NAME = "agent-kit";
export const GUIDELINES_SKILL = "engineering-guidelines";

const GUIDELINES_DESCRIPTION =
  "Core engineering guidelines: inspect the code and conventions before changing anything, keep changes scoped, verify with the project's own commands, and report honestly. Use when planning, writing, changing, or reviewing code in any project. Do not use for questions unrelated to software work.";

export interface PluginFile {
  /** Path relative to the plugin root. */
  path: string;
  content: string;
}

function itemName(item: PackagedItem): string {
  return item.id.slice(item.id.indexOf("/") + 1);
}

/**
 * Rewrites standalone references to catalog names (`kit-code-review`) into plugin names
 * (`agent-kit:code-review`). Paths and longer identifiers such as `agent-kit-commit`,
 * `.claude/skills/kit-code-review/`, or `kit-commits` are left alone. Names are limited to
 * lowercase letters, digits, and hyphens by the registry schema, so they need no escaping.
 */
function rewriteReferences(content: string, catalogNames: readonly string[]): string {
  if (catalogNames.length === 0) return content;
  const references = new RegExp(
    `(?<![\\w./-])${NAME_PREFIX}(${catalogNames.join("|")})(?![\\w-])`,
    "g",
  );
  return content.replace(references, `${PLUGIN_NAME}:$1`);
}

/** Sets `name` inside a leading frontmatter block only; content without one is unchanged. */
function setFrontmatterName(content: string, name: string): string {
  const block = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/.exec(content);
  if (!block) return content;
  const updated = /^name:/m.test(block[0])
    ? block[0].replace(/^name:[ \t]*.*$/m, `name: ${name}`)
    : block[0].replace(/^---(\r?\n)/, `---$1name: ${name}$1`);
  return updated + content.slice(block[0].length);
}

/**
 * Renders an item into plugin-relative files. `catalogNames` lists the skill and agent names in
 * the catalog, so cross-references such as "use kit-code-review" become "agent-kit:code-review".
 */
export function renderPlugin(
  item: PackagedItem,
  contents: ReadonlyMap<string, string>,
  catalogNames: readonly string[],
): PluginFile[] {
  const name = itemName(item);
  const files = item.files.map((file): PluginFile => {
    const content = contents.get(file.source)!;
    switch (item.type) {
      case "guideline": {
        const { body } = splitFrontmatter(content);
        const frontmatter = `---\nname: ${GUIDELINES_SKILL}\ndescription: ${JSON.stringify(GUIDELINES_DESCRIPTION)}\n---\n\n`;
        return { path: `skills/${GUIDELINES_SKILL}/SKILL.md`, content: frontmatter + body };
      }
      case "skill": {
        const rest = file.destination.slice(`.claude/skills/${NAME_PREFIX}${name}/`.length);
        const text = rest === "SKILL.md" ? setFrontmatterName(content, name) : content;
        return { path: `skills/${name}/${rest}`, content: text };
      }
      case "agent":
        return { path: `agents/${name}.md`, content: setFrontmatterName(content, name) };
      case "rule":
        return {
          path: `skills/${name}-rules/SKILL.md`,
          content: ruleSkill(item, content, `${name}-rules`),
        };
    }
  });
  return files.map((f) => ({ ...f, content: rewriteReferences(f.content, catalogNames) }));
}
