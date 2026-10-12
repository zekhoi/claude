import { readdir } from "node:fs/promises";
import path from "node:path";
import { CLAUDE_MD, NAME_PREFIX, parseFrontmatter, validateContent } from "../adapters/claude.js";
import { error, warning, type Diagnostic } from "../core/diagnostics.js";
import { MANIFEST_PATH } from "../core/manifest.js";
import { emit } from "../core/output.js";
import { requiredPaths } from "../core/planner.js";
import type { Manifest, RegistryItem } from "../core/schemas.js";
import { readTargetFile, resolveIn } from "../core/target.js";
import { inspectTarget, type Inspection } from "./status.js";

/** Installed names that Claude Code uses for invocation, mapped to their item's destination. */
function installedNames(manifest: Manifest): Map<string, string> {
  const names = new Map<string, string>();
  for (const [id, entry] of Object.entries(manifest.items)) {
    const [type, name] = id.split("/");
    if (type !== "skill" && type !== "agent") continue;
    const main = entry.files.find((f) =>
      type === "skill" ? f.destination.endsWith("/SKILL.md") : true,
    );
    if (main) names.set(`${NAME_PREFIX}${name}`, main.destination);
  }
  return names;
}

/** Other project skills and agents that claim one of our names. */
async function nameCollisions(root: string, manifest: Manifest): Promise<Diagnostic[]> {
  const ours = installedNames(manifest);
  const diagnostics: Diagnostic[] = [];
  const check = async (rel: string, fallbackName: string) => {
    const state = await readTargetFile(root, rel);
    if (state.state !== "file") return;
    const declared = parseFrontmatter(state.text)?.["name"];
    const name = typeof declared === "string" ? declared : fallbackName;
    const owner = ours.get(name);
    if (owner && owner !== rel) {
      diagnostics.push(
        error("NAME_COLLISION", `${rel} also declares the name ${name}, installed at ${owner}`, {
          path: rel,
          action: "Rename one of them so Claude Code can tell them apart",
        }),
      );
    }
  };
  const list = (dir: string) =>
    readdir(resolveIn(root, dir), { withFileTypes: true }).catch(() => []);
  for (const entry of await list(".claude/skills")) {
    if (entry.isDirectory()) await check(`.claude/skills/${entry.name}/SKILL.md`, entry.name);
  }
  for (const entry of await list(".claude/agents")) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      await check(`.claude/agents/${entry.name}`, entry.name.slice(0, -3));
    }
  }
  return diagnostics;
}

/** Staging and backup files left by interrupted commands. */
async function leftovers(root: string, manifest: Manifest | undefined): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const byDir = new Map<string, Set<string>>();
  for (const rel of [...requiredPaths(manifest), MANIFEST_PATH]) {
    const dir = path.posix.dirname(rel);
    byDir.set(dir, (byDir.get(dir) ?? new Set()).add(path.posix.basename(rel)));
  }
  for (const [dir, bases] of byDir) {
    const entries = await readdir(resolveIn(root, dir)).catch(() => [] as string[]);
    for (const entry of entries) {
      const match = /^(.*)\.agent-kit-\d+\.(tmp|bak)$/.exec(entry);
      if (!match || !bases.has(match[1]!)) continue;
      const rel = dir === "." ? entry : `${dir}/${entry}`;
      diagnostics.push(
        warning("LEFTOVER_FILE", "temporary file left by an interrupted agent-kit command", {
          path: rel,
          action: "Delete it once `agent-kit status` shows the installation is consistent",
        }),
      );
    }
  }
  return diagnostics;
}

async function checkInstallation(inspection: Inspection): Promise<Diagnostic[]> {
  const { root, manifest, status } = inspection;
  if (!manifest || !status) return [];
  const diagnostics: Diagnostic[] = [];

  for (const block of status.blocks) {
    const at = { path: block.path };
    if (block.status === "malformed") {
      diagnostics.push(
        error("MALFORMED_BLOCK", "agent-kit markers are malformed", {
          ...at,
          action: "Repair the markers so exactly one start and one end marker remain",
        }),
      );
    } else if (block.status === "removed" || block.status === "missing") {
      diagnostics.push(
        error("MALFORMED_BLOCK", `the managed block is ${block.status}`, {
          ...at,
          action: "Restore it from version control, or run `agent-kit eject` for its item",
        }),
      );
    } else if (block.status === "modified") {
      diagnostics.push(
        warning("LOCAL_EDIT_CONFLICT", "the managed block was edited; updates to it will stop", {
          ...at,
          action: "Move your edits outside the markers to keep receiving updates",
        }),
      );
    } else if (block.status === "unsafe") {
      diagnostics.push(error("UNSAFE_PATH", "the file is a symlink or escapes the target", at));
    }
  }

  for (const item of status.items) {
    for (const f of item.files) {
      if (f.kind !== "file") continue;
      const at = { path: f.destination };
      if (f.status === "modified") {
        diagnostics.push(
          warning("LOCAL_EDIT_CONFLICT", `${item.id} was edited locally; updates will skip it`, {
            ...at,
            action: `Keep your version with \`agent-kit eject ${item.id}\`, or restore it with \`agent-kit show ${item.id} --file ${f.destination}\``,
          }),
        );
      } else if (f.status === "missing") {
        diagnostics.push(
          warning("MISSING_FILE", `${item.id} is missing a file`, {
            ...at,
            action: `Restore it with \`agent-kit show ${item.id} --file ${f.destination}\`, or run \`agent-kit remove ${item.id}\``,
          }),
        );
      } else if (f.status === "unsafe") {
        diagnostics.push(error("UNSAFE_PATH", "the file is a symlink or escapes the target", at));
      }
      if (f.status === "ok" || f.status === "modified") {
        const state = await readTargetFile(root, f.destination);
        if (state.state === "file") {
          const [type, name] = item.id.split("/") as [RegistryItem["type"], string];
          const pseudo = { id: item.id, type } as RegistryItem;
          diagnostics.push(
            ...validateContent(
              pseudo,
              { source: f.destination, destination: f.destination, install: "file" },
              state.text,
            ).map((d) => ({
              ...d,
              action: d.action ?? `Claude Code may not recognize ${NAME_PREFIX}${name}`,
            })),
          );
        }
      }
    }
    if (item.retired) {
      diagnostics.push(
        warning("ITEM_RETIRED", `${item.id} is no longer in the bundled catalog`, {
          action: `Keep it with \`agent-kit eject ${item.id}\` or delete it with \`agent-kit remove ${item.id}\``,
        }),
      );
    } else if (item.available) {
      diagnostics.push(
        warning("UPDATE_AVAILABLE", `${item.id} ${item.version} → ${item.available} is available`, {
          action: `Run \`agent-kit update${item.update === "major" ? ` ${item.id} --allow-major` : ""}\``,
        }),
      );
    }
  }

  if (status.claudeImport && !status.claudeImport.present) {
    diagnostics.push(
      error(
        "IMPORT_MISSING",
        "CLAUDE.md no longer imports AGENTS.md, so Claude Code ignores the guidelines",
        {
          path: CLAUDE_MD,
          action: "Add a line containing @AGENTS.md to CLAUDE.md",
        },
      ),
    );
  }
  if (status.context && !status.context.present) {
    diagnostics.push(
      warning("CONTEXT_MISSING", "the project context file referenced from AGENTS.md is missing", {
        path: status.context.path,
        action: "Restore it, or create it again with `agent-kit init --context`",
      }),
    );
  }
  diagnostics.push(...(await nameCollisions(root, manifest)));
  return diagnostics;
}

/** Read-only diagnostics. Exits 1 when any error is found. Never writes or locks. */
export async function doctor(options: { cwd: string; json: boolean }): Promise<number> {
  const inspection = await inspectTarget(options.cwd);
  const root = inspection.root ?? null;
  const diagnostics = [...inspection.diagnostics];
  if ("registry" in inspection) {
    diagnostics.push(...(await checkInstallation(inspection)));
    diagnostics.push(...(await leftovers(inspection.root, inspection.manifest)));
  }
  const installed = "manifest" in inspection && inspection.manifest !== undefined;
  const data = { installed, checked: root !== null };
  return emit({ command: "doctor", target: root, data, diagnostics }, options.json, () => {
    const problems = diagnostics.filter((d) => d.severity !== "warning").length;
    const notes = diagnostics.length - problems;
    if (!installed && root) return `Target: ${root}\nagent-kit is not installed here.`;
    return `Target: ${root}\n${problems === 0 && notes === 0 ? "No problems found." : `${problems} problem(s), ${notes} warning(s):`}`;
  });
}
