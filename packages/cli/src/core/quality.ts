import path from "node:path";
import { parseFrontmatter } from "../adapters/claude.js";
import { error, type Diagnostic } from "./diagnostics.js";
import type { RegistryItem } from "./schemas.js";

/** Uppercase work markers; lowercase "todo" is an ordinary word. */
const MARKER = /\b(?:TODO|TBD|FIXME|XXX)\b/;
const FILLER = /lorem ipsum|<placeholder>/i;
const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Content checks beyond format validity: no unfinished placeholders, local links that resolve
 * within the installed item, and skill descriptions that state when to use and skip the skill.
 * External links are not fetched here so validation stays deterministic.
 */
export function validateQuality(
  item: RegistryItem,
  file: { source: string; destination: string },
  content: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const at = { path: file.source };

  content.split(/\r?\n/).forEach((line, i) => {
    const match = MARKER.exec(line) ?? FILLER.exec(line);
    if (match) {
      diagnostics.push(
        error("PLACEHOLDER", `unfinished placeholder "${match[0]}" on line ${i + 1}`, at),
      );
    }
  });

  const destinations = new Set(item.files.map((f) => f.destination));
  for (const [, target] of content.matchAll(LINK)) {
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    const local = decodeURIComponent(target.split("#")[0]!);
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(file.destination), local),
    );
    if (!destinations.has(resolved)) {
      diagnostics.push(
        error("BROKEN_REFERENCE", `link to ${target} does not resolve to a file of ${item.id}`, {
          ...at,
          action: "Ship the referenced file with the item, or link to an external URL",
        }),
      );
    }
  }

  if (item.type === "skill" && file.destination.endsWith("/SKILL.md")) {
    const description = parseFrontmatter(content)?.["description"];
    if (
      typeof description === "string" &&
      (!/\buse when\b/i.test(description) || !/\b(do not use|don't use|skip)\b/i.test(description))
    ) {
      diagnostics.push(
        error("TRIGGER_UNCLEAR", "skill description must say when to use it and when not to", {
          ...at,
          action: 'Include "Use when ..." and "Do not use for ..." in the description',
        }),
      );
    }
  }
  return diagnostics;
}
