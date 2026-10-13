import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CLAUDE_MD, NAME_PREFIX } from "../adapters/claude.js";
import { invocationName, validateInstalledFile } from "../adapters/index.js";
import { error, warning, type Diagnostic } from "../core/diagnostics.js";
import { MANIFEST_PATH, readManifest } from "../core/manifest.js";
import { emit } from "../core/output.js";
import { requiredPaths } from "../core/planner.js";
import type { PackagedRegistry } from "../core/registry.js";
import type { Manifest, RegistryItem } from "../core/schemas.js";
import { readTargetFile, resolveIn } from "../core/target.js";
import type { Where } from "../core/scope.js";
import { workspacePackages } from "../core/workspaces.js";
import { inspectTarget, type Inspection } from "./status.js";

/** Other project skills and agents that claim one of our installed names, per tool. */
async function nameCollisions(root: string, manifest: Manifest): Promise<Diagnostic[]> {
  const ours = new Map<string, string>();
  for (const entry of Object.values(manifest.items)) {
    for (const f of entry.files) {
      const state = await readTargetFile(root, f.destination);
      const id = invocationName(f.destination, state.state === "file" ? state.text : undefined);
      if (id) ours.set(`${id.namespace}\0${id.name}`, f.destination);
    }
  }
  const diagnostics: Diagnostic[] = [];
  const check = async (rel: string) => {
    const state = await readTargetFile(root, rel);
    if (state.state !== "file") return;
    const id = invocationName(rel, state.text);
    const owner = id && ours.get(`${id.namespace}\0${id.name}`);
    if (id && owner && owner !== rel) {
      diagnostics.push(
        error("NAME_COLLISION", `${rel} also declares the name ${id.name}, installed at ${owner}`, {
          path: rel,
          action: `Rename one of them so ${id.namespace.replace(/ (skills|subagents)$/, "")} can tell them apart`,
        }),
      );
    }
  };
  const list = (dir: string) =>
    readdir(resolveIn(root, dir), { withFileTypes: true }).catch(() => []);
  for (const dir of [".claude/skills", ".agents/skills"]) {
    for (const entry of await list(dir)) {
      if (entry.isDirectory()) await check(`${dir}/${entry.name}/SKILL.md`);
    }
  }
  for (const [dir, ext] of [
    [".claude/agents", ".md"],
    [".codex/agents", ".toml"],
  ] as const) {
    for (const entry of await list(dir)) {
      if (entry.isFile() && entry.name.endsWith(ext)) await check(`${dir}/${entry.name}`);
    }
  }
  return diagnostics;
}

/** Staging and backup files left by interrupted commands. */
async function leftovers(
  root: string,
  registry: PackagedRegistry,
  manifest: Manifest | undefined,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const byDir = new Map<string, Set<string>>();
  for (const rel of [...requiredPaths(registry, manifest), MANIFEST_PATH]) {
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

/**
 * Items installed both in this project and globally. Claude Code prefers the user-level copy of
 * a skill but the project copy of a subagent, and loads both copies of rules and guidelines.
 */
async function scopeOverlap(root: string, manifest: Manifest): Promise<Diagnostic[]> {
  if (manifest.scope !== "project") return [];
  const home = await realpath(homedir()).catch(() => undefined);
  if (!home || home === root) return [];
  const { manifest: global } = await readManifest(home);
  if (!global || global.scope !== "user") return [];

  const claude = manifest.agents.includes("claude") && global.agents.includes("claude");
  const diagnostics: Diagnostic[] = [];
  for (const [id, entry] of Object.entries(manifest.items).sort(([a], [b]) => a.localeCompare(b))) {
    const globalEntry = global.items[id];
    if (!globalEntry) continue;
    const type = id.slice(0, id.indexOf("/"));
    const versions =
      entry.version === globalEntry.version
        ? `both at ${entry.version}`
        : `${entry.version} here, ${globalEntry.version} globally`;
    const effect = !claude
      ? "both copies load"
      : type === "skill"
        ? "Claude Code uses the global copy, so this project's copy and any edits to it are ignored"
        : type === "agent"
          ? "Claude Code uses this project's copy and ignores the global one"
          : "Claude Code loads both copies, so the same instructions apply twice";
    diagnostics.push(
      warning("SCOPE_OVERLAP", `${id} is installed here and globally (${versions}); ${effect}`, {
        action: `Keep one: run \`agent-kit remove ${id}\` here, or \`agent-kit remove ${id} --global\``,
      }),
    );
  }
  return diagnostics;
}

/**
 * Items also installed by a project installation in an ancestor directory, such as a monorepo
 * root above a package. The scan stops at the git root (inclusive) and never looks into sibling
 * packages; the home directory is covered by `scopeOverlap`. Which nested copy an agent prefers
 * is not documented, so the warning does not guess.
 */
async function ancestorOverlap(root: string, manifest: Manifest): Promise<Diagnostic[]> {
  if (manifest.scope !== "project") return [];
  const isGitRoot = (dir: string) =>
    stat(path.join(dir, ".git")).then(
      () => true,
      () => false,
    );
  if (await isGitRoot(root)) return [];
  const home = await realpath(homedir()).catch(() => undefined);
  const diagnostics: Diagnostic[] = [];
  for (
    let dir = path.dirname(root);
    dir !== path.dirname(dir) && dir !== home;
    dir = path.dirname(dir)
  ) {
    const { manifest: other } = await readManifest(dir).catch(() => ({ manifest: undefined }));
    if (other?.scope === "project") {
      const where = path.relative(root, dir).split(path.sep).join("/");
      for (const [id, entry] of Object.entries(manifest.items).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const outer = other.items[id];
        if (!outer) continue;
        const versions =
          entry.version === outer.version
            ? `both at ${entry.version}`
            : `${entry.version} here, ${outer.version} in ${where}`;
        diagnostics.push(
          warning(
            "SCOPE_OVERLAP",
            `${id} is installed here and in the enclosing project ${where} (${versions}); agents working here can discover both copies, and which one they use is not documented`,
            {
              action: `Keep one: run \`agent-kit remove ${id}\` here, or \`agent-kit remove ${id} --cwd ${where}\``,
            },
          ),
        );
      }
    }
    if (await isGitRoot(dir)) break;
  }
  return diagnostics;
}

/**
 * Items also installed by workspace packages below this installation, for a monorepo root.
 * Only packages declared in pnpm-workspace.yaml or package.json `workspaces` are checked.
 */
async function workspaceOverlap(root: string, manifest: Manifest): Promise<Diagnostic[]> {
  if (manifest.scope !== "project") return [];
  const diagnostics: Diagnostic[] = [];
  for (const pkg of await workspacePackages(root)) {
    const { manifest: inner } = await readManifest(path.join(root, ...pkg.split("/"))).catch(
      () => ({ manifest: undefined }),
    );
    if (inner?.scope !== "project") continue;
    for (const [id, entry] of Object.entries(manifest.items).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const other = inner.items[id];
      if (!other) continue;
      const versions =
        entry.version === other.version
          ? `both at ${entry.version}`
          : `${entry.version} here, ${other.version} in ${pkg}`;
      diagnostics.push(
        warning(
          "SCOPE_OVERLAP",
          `${id} is installed here and in the workspace package ${pkg} (${versions}); agents working in that package can discover both copies, and which one they use is not documented`,
          {
            action: `Keep one: run \`agent-kit remove ${id}\` here, or \`agent-kit remove ${id} --cwd ${pkg}\``,
          },
        ),
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
          const tool = f.destination.startsWith(".claude/") ? "Claude Code" : "Codex";
          diagnostics.push(
            ...validateInstalledFile(
              { id: item.id, type, version: item.version },
              f.destination,
              state.text,
            ).map((d) => ({
              ...d,
              path: f.destination,
              action: d.action ?? `${tool} may not recognize ${NAME_PREFIX}${name}`,
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
  diagnostics.push(...(await scopeOverlap(root, manifest)));
  diagnostics.push(...(await ancestorOverlap(root, manifest)));
  diagnostics.push(...(await workspaceOverlap(root, manifest)));
  return diagnostics;
}

/** Read-only diagnostics. Exits 1 when any error is found. Never writes or locks. */
export async function doctor(options: Where & { json: boolean }): Promise<number> {
  const inspection = await inspectTarget(options);
  const root = inspection.root ?? null;
  const diagnostics = [...inspection.diagnostics];
  if ("registry" in inspection) {
    diagnostics.push(...(await checkInstallation(inspection)));
    diagnostics.push(
      ...(await leftovers(inspection.root, inspection.registry, inspection.manifest)),
    );
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
