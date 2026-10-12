import { parse as parseYaml } from "yaml";
import { error, type Diagnostic } from "../core/diagnostics.js";
import { isSafeRelativePath } from "../core/paths.js";
import type { InstallMode, ItemType, RegistryItem } from "../core/schemas.js";

/** Prefix for installed skill and agent names, which are invocation names in Claude Code. */
export const NAME_PREFIX = "kit-";
/** Rules are namespaced by directory because their file names are not invocation names. */
export const RULES_DIR = ".claude/rules/agent-kit";
/** Claude Code caps skill descriptions at 1,536 characters. */
const SKILL_DESCRIPTION_MAX = 1536;

interface FileRef {
  source: string;
  destination: string;
  install: InstallMode;
}

function itemName(item: RegistryItem): string {
  return item.id.slice(item.id.indexOf("/") + 1);
}

/** Destination patterns each item type may declare. Anything else is rejected. */
function allowedDestination(type: ItemType, name: string, file: FileRef): boolean {
  const d = file.destination;
  switch (type) {
    case "guideline":
      return file.install === "managed-block" && d === "AGENTS.md";
    case "rule":
      return file.install === "file" && d === `${RULES_DIR}/${name}.md`;
    case "agent":
      return file.install === "file" && d === `.claude/agents/${NAME_PREFIX}${name}.md`;
    case "skill": {
      const dir = `.claude/skills/${NAME_PREFIX}${name}/`;
      if (file.install !== "file" || !d.startsWith(dir)) return false;
      const rest = d.slice(dir.length);
      return rest === "SKILL.md" || /^(references|scripts|assets)\/.+/.test(rest);
    }
  }
}

function describeAllowed(type: ItemType, name: string): string {
  switch (type) {
    case "guideline":
      return "AGENTS.md (managed-block)";
    case "rule":
      return `${RULES_DIR}/${name}.md`;
    case "agent":
      return `.claude/agents/${NAME_PREFIX}${name}.md`;
    case "skill":
      return `.claude/skills/${NAME_PREFIX}${name}/{SKILL.md,references/**,scripts/**,assets/**}`;
  }
}

export function validateDestination(item: RegistryItem, file: FileRef): Diagnostic[] {
  if (!isSafeRelativePath(file.destination)) {
    return [
      error("UNSAFE_PATH", `${item.id} declares an unsafe destination`, {
        path: file.destination,
      }),
    ];
  }
  const name = itemName(item);
  if (!allowedDestination(item.type, name, file)) {
    return [
      error("DESTINATION_NOT_ALLOWED", `${item.id} cannot install to this destination`, {
        path: file.destination,
        action: `Use ${describeAllowed(item.type, name)}`,
      }),
    ];
  }
  return [];
}

export function validateItemFiles(item: RegistryItem): Diagnostic[] {
  const diagnostics = item.files.flatMap((f) => validateDestination(item, f));
  if (
    item.type === "skill" &&
    !item.files.some((f) => f.destination.endsWith(`${NAME_PREFIX}${itemName(item)}/SKILL.md`))
  ) {
    diagnostics.push(
      error("DESTINATION_NOT_ALLOWED", `${item.id} must install a SKILL.md`, {
        action: `Add a file with destination ${describeAllowed("skill", itemName(item))}`,
      }),
    );
  }
  return diagnostics;
}

/** Splits leading YAML frontmatter. Returns undefined when the file has none or it is unparsable. */
export function parseFrontmatter(content: string): Record<string, unknown> | undefined {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content.replace(/\r\n?/g, "\n"));
  if (!match) return undefined;
  try {
    const data: unknown = parseYaml(match[1] ?? "");
    return data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Checks Claude Code format requirements for an item file's content. */
export function validateContent(item: RegistryItem, file: FileRef, content: string): Diagnostic[] {
  const at = { path: file.source };
  const name = itemName(item);
  const isSkillMain = item.type === "skill" && file.destination.endsWith("/SKILL.md");
  const isAgent = item.type === "agent";
  const isRule = item.type === "rule";
  if (!isSkillMain && !isAgent && !isRule) return [];

  const fm = parseFrontmatter(content);
  if (isRule) {
    if (fm === undefined) return [];
    const paths = fm["paths"];
    const ok =
      paths === undefined ||
      typeof paths === "string" ||
      (Array.isArray(paths) && paths.every((p) => typeof p === "string"));
    return ok
      ? []
      : [error("INVALID_FRONTMATTER", "rule `paths` must be a string or list of globs", at)];
  }
  if (fm === undefined) {
    return [error("INVALID_FRONTMATTER", `${item.id} requires YAML frontmatter`, at)];
  }

  const diagnostics: Diagnostic[] = [];
  const expected = `${NAME_PREFIX}${name}`;
  if (fm["name"] !== expected) {
    diagnostics.push(
      error("INVALID_FRONTMATTER", `frontmatter name must be "${expected}"`, {
        ...at,
        action: `Set \`name: ${expected}\``,
      }),
    );
  }
  const description = fm["description"];
  if (typeof description !== "string" || description.trim() === "") {
    diagnostics.push(error("INVALID_FRONTMATTER", "frontmatter description is required", at));
  } else if (isSkillMain && description.length > SKILL_DESCRIPTION_MAX) {
    diagnostics.push(
      error(
        "INVALID_FRONTMATTER",
        `skill description exceeds ${SKILL_DESCRIPTION_MAX} characters`,
        at,
      ),
    );
  }
  return diagnostics;
}
