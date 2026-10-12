import { error, conflict, type Diagnostic } from "../core/diagnostics.js";
import { acquireLock, type Lock } from "../core/lock.js";
import { MANIFEST_PATH, readManifest, serializeManifest } from "../core/manifest.js";
import { emit } from "../core/output.js";
import { planInstall, requiredPaths, resolveSelection, type Plan } from "../core/planner.js";
import { loadPackagedRegistry, readTemplate, type PackagedRegistry } from "../core/registry.js";
import { BUNDLED_REGISTRY_DIR, CLI_VERSION } from "../core/runtime.js";
import type { PlannedChange } from "../core/schemas.js";
import { readTargetFiles, resolveTarget } from "../core/target.js";
import {
  applyWrites,
  removeLeftovers,
  TargetChangedError,
  type ApplyHooks,
} from "../core/writer.js";

export interface InstallOptions {
  command: "init" | "add";
  cwd: string;
  json: boolean;
  dryRun: boolean;
  context: boolean;
  /** Returns the item and preset ids to install, after the registry has loaded. */
  select: (registry: PackagedRegistry) => Promise<string[] | Diagnostic>;
  hooks?: ApplyHooks;
}

interface InstallData {
  dryRun: boolean;
  applied: boolean;
  changes: PlannedChange[];
}

const WIDTH = 9;

function render(target: string, data: InstallData): string {
  const lines = [`Target: ${target}`];
  for (const c of data.changes) {
    const detail = [
      c.itemId && `${c.itemId}${c.toVersion ? `@${c.toVersion}` : ""}`,
      c.kind === "managed-block" && "managed block",
      c.reason,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`  ${c.action.padEnd(WIDTH)} ${c.destination}${detail ? `  (${detail})` : ""}`);
  }
  const pending = data.changes.filter((c) => ["create", "update", "adopt"].includes(c.action));
  if (data.changes.some((c) => c.action === "conflict")) {
    lines.push("", "Nothing was written because of conflicts.");
  } else if (data.dryRun) {
    lines.push("", `Dry run: ${pending.length} change(s) planned; nothing was written.`);
  } else if (data.applied) {
    lines.push("", `Applied ${pending.length} change(s). Review them with: git status && git diff`);
  } else {
    lines.push("", "No changes.");
  }
  return lines.join("\n");
}

export async function install(options: InstallOptions): Promise<number> {
  const { command, json, dryRun } = options;
  const done = (target: string | null, diagnostics: Diagnostic[], data?: InstallData) =>
    emit({ command, target, diagnostics, ...(data ? { data } : {}) }, json, (d) =>
      render(target ?? "", d),
    );

  const loaded = await loadPackagedRegistry(BUNDLED_REGISTRY_DIR);
  if (!loaded.value || loaded.diagnostics.length > 0) return done(null, loaded.diagnostics);
  const registry = loaded.value;

  const { root, diagnostics: targetDiagnostics } = await resolveTarget(options.cwd);
  if (!root) return done(null, targetDiagnostics);

  const ids = await options.select(registry);
  if (!Array.isArray(ids)) return done(root, [ids]);
  const selection = resolveSelection(registry, ids);
  if (!selection.request) return done(root, selection.diagnostics);
  const request = { ...selection.request, context: options.context };

  let lock: Lock | undefined;
  if (!dryRun) {
    const acquired = await acquireLock(root, command);
    if (!acquired.lock) return done(root, acquired.diagnostics);
    lock = acquired.lock;
  }

  try {
    const { manifest, diagnostics: manifestDiagnostics } = await readManifest(root);
    if (manifestDiagnostics.length > 0) return done(root, manifestDiagnostics);

    const paths = requiredPaths(request);
    const plan: Plan = planInstall({
      registry,
      manifest,
      files: await readTargetFiles(root, paths),
      request,
      cliVersion: CLI_VERSION,
      contextTemplate: request.context ? await readTemplate(registry, "agent-context.md") : "",
    });
    const data: InstallData = { dryRun, applied: false, changes: plan.changes };
    const blocked = plan.diagnostics.some((d) => d.severity === "conflict");
    // A terminated predecessor's staging files are removed once the target is consistent.
    const cleanUp = async () => {
      if (lock?.takenOverFrom !== undefined) {
        await removeLeftovers(root, [...paths, MANIFEST_PATH], lock.takenOverFrom);
      }
    };
    if (dryRun || blocked) return done(root, plan.diagnostics, data);
    if (plan.writes.length === 0 && !plan.manifestChanged) {
      await cleanUp();
      return done(root, plan.diagnostics, data);
    }

    try {
      await applyWrites(
        root,
        plan.writes,
        plan.manifestChanged ? serializeManifest(plan.manifest) : undefined,
        options.hooks,
      );
    } catch (e) {
      const diagnostic =
        e instanceof TargetChangedError
          ? conflict("TARGET_CHANGED", "a file changed while the command was running", {
              path: e.destination,
              action: "Rerun the command; all changes from this run were rolled back",
            })
          : error("WRITE_FAILED", `writing failed: ${(e as Error).message}`, {
              action: "All changes from this run were rolled back; fix the cause and rerun",
            });
      return done(root, [...plan.diagnostics, diagnostic], data);
    }
    await cleanUp();
    return done(root, plan.diagnostics, { ...data, applied: true });
  } finally {
    await lock?.release();
  }
}
