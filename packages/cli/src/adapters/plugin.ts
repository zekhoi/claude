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

/** Rewrites references to catalog names into plugin names, then sets the frontmatter `name`. */
function retarget(content: string, name: string, catalogNames: readonly string[]): string {
  const references = new RegExp(`\\b${NAME_PREFIX}(${catalogNames.join("|")})\\b(?!-)`, "g");
  const rewritten =
    catalogNames.length > 0 ? content.replace(references, `${PLUGIN_NAME}:$1`) : content;
  return rewritten.replace(/^(---\r?\n[\s\S]*?^name:[ \t]*).*$/m, `$1${name}`);
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
  return item.files.map((file) => {
    const content = contents.get(file.source)!;
    switch (item.type) {
      case "guideline": {
        const { body } = splitFrontmatter(content);
        const frontmatter = `---\nname: ${GUIDELINES_SKILL}\ndescription: ${JSON.stringify(GUIDELINES_DESCRIPTION)}\n---\n\n`;
        return { path: `skills/${GUIDELINES_SKILL}/SKILL.md`, content: frontmatter + body };
      }
      case "skill": {
        const rest = file.destination.slice(`.claude/skills/${NAME_PREFIX}${name}/`.length);
        const text = rest === "SKILL.md" ? retarget(content, name, catalogNames) : content;
        return { path: `skills/${name}/${rest}`, content: text };
      }
      case "agent":
        return { path: `agents/${name}.md`, content: retarget(content, name, catalogNames) };
      case "rule":
        return {
          path: `skills/${name}-rules/SKILL.md`,
          content: ruleSkill(item, content, `${name}-rules`),
        };
    }
  });
}
