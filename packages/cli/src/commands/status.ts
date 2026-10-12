import { warning, type Diagnostic } from "../core/diagnostics.js";
import { inspectInstallation, type InstallationStatus } from "../core/inspect.js";
import { inspectLock } from "../core/lock.js";
import { readManifest } from "../core/manifest.js";
import { emit } from "../core/output.js";
import { requiredPaths } from "../core/planner.js";
import { loadPackagedRegistry, type PackagedRegistry } from "../core/registry.js";
import { BUNDLED_REGISTRY_DIR } from "../core/runtime.js";
import type { Manifest } from "../core/schemas.js";
import { readTargetFiles, resolveTarget } from "../core/target.js";

export interface Inspection {
  root: string;
  registry: PackagedRegistry;
  manifest?: Manifest;
  status?: InstallationStatus;
  diagnostics: Diagnostic[];
}

/** Loads everything read-only commands need. Never writes, locks, or creates directories. */
export async function inspectTarget(
  cwd: string,
): Promise<Inspection | { diagnostics: Diagnostic[]; root?: string }> {
  const loaded = await loadPackagedRegistry(BUNDLED_REGISTRY_DIR);
  if (!loaded.value || loaded.diagnostics.length > 0) return { diagnostics: loaded.diagnostics };
  const { root, diagnostics } = await resolveTarget(cwd);
  if (!root) return { diagnostics };

  const lockDiagnostics: Diagnostic[] = [];
  const lock = await inspectLock(root);
  if (lock) {
    const owner = lock.holder
      ? `${lock.holder.command} (pid ${lock.holder.pid} on ${lock.holder.host})`
      : "an unreadable lock file";
    lockDiagnostics.push(
      warning(
        "LOCK_HELD",
        lock.alive === false
          ? `a lock from ${owner} remains after that process ended`
          : `a lock is held by ${owner}`,
        {
          path: ".agent-kit/lock",
          action:
            lock.alive === false
              ? "The next agent-kit command will take it over and finish cleanly"
              : "Wait for the command to finish; if none is running, delete .agent-kit/lock",
        },
      ),
    );
  }

  const read = await readManifest(root);
  if (read.diagnostics.length > 0) {
    return { root, diagnostics: [...read.diagnostics, ...lockDiagnostics] };
  }
  if (!read.manifest) return { root, registry: loaded.value, diagnostics: lockDiagnostics };
  const files = await readTargetFiles(root, requiredPaths(loaded.value, read.manifest));
  return {
    root,
    registry: loaded.value,
    manifest: read.manifest,
    status: inspectInstallation(read.manifest, files, loaded.value),
    diagnostics: lockDiagnostics,
  };
}

interface StatusData {
  installed: boolean;
  status?: InstallationStatus;
}

function render(root: string, data: StatusData): string {
  const lines = [`Target: ${root}`];
  if (!data.status) {
    lines.push("agent-kit is not installed here. Run `agent-kit init` to install it.");
    return lines.join("\n");
  }
  const s = data.status;
  const presets = s.presets.map((p) => p.replace(/^preset\//, "")).join(", ") || "none";
  lines.push(`Installed by agent-kit ${s.cliVersion} · presets: ${presets}`, "", "Items:");
  const width = Math.max(...s.items.map((i) => i.id.length), 4);
  for (const item of s.items) {
    const problems = item.files
      .filter((f) => f.status !== "ok")
      .map((f) => `${f.status}: ${f.destination}`);
    const notes = [
      ...problems,
      item.retired && "no longer in the catalog",
      item.available && `${item.update} update available: ${item.available}`,
    ].filter(Boolean);
    lines.push(
      `  ${item.id.padEnd(width)}  ${item.version.padEnd(7)}  ${notes.length ? notes.join("; ") : "ok"}`,
    );
  }
  if (s.items.length === 0) lines.push("  (none)");
  if (s.blocks.length > 0) {
    lines.push("", "Managed blocks:");
    for (const b of s.blocks) lines.push(`  ${b.path.padEnd(width)}  ${b.status}`);
  }
  if (s.claudeImport) {
    lines.push(
      "",
      `CLAUDE.md import of AGENTS.md: ${s.claudeImport.ownership}${s.claudeImport.present ? "" : " (missing)"}`,
    );
  }
  if (s.context) {
    lines.push(`Project context: ${s.context.path}${s.context.present ? "" : " (missing)"}`);
  }
  if (s.suggestions.length > 0) {
    lines.push(
      "",
      `Not installed from your presets: ${s.suggestions.join(", ")}`,
      "  Add them with: agent-kit add <id>",
    );
  }
  return lines.join("\n");
}

export async function status(options: { cwd: string; json: boolean }): Promise<number> {
  const result = await inspectTarget(options.cwd);
  const root = result.root ?? null;
  if (!("registry" in result)) {
    return emit(
      { command: "status", target: root, diagnostics: result.diagnostics },
      options.json,
      () => "",
    );
  }
  const data: StatusData = {
    installed: result.status !== undefined,
    ...(result.status ? { status: result.status } : {}),
  };
  return emit(
    { command: "status", target: root, data, diagnostics: result.diagnostics },
    options.json,
    (d) => render(result.root, d),
  );
}
