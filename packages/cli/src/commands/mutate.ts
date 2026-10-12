import { rmdir } from "node:fs/promises";
import { conflict, error, type Diagnostic } from "../core/diagnostics.js";
import { acquireLock, type Lock } from "../core/lock.js";
import { MANIFEST_PATH, readManifest, serializeManifest, STATE_DIR } from "../core/manifest.js";
import { emit } from "../core/output.js";
import type { Plan } from "../core/plan-builder.js";
import { loadPackagedRegistry, type PackagedRegistry } from "../core/registry.js";
import { BUNDLED_REGISTRY_DIR, CLI_VERSION } from "../core/runtime.js";
import type { Manifest, PlannedChange } from "../core/schemas.js";
import { readTargetFiles, resolveIn, resolveTarget } from "../core/target.js";
import {
  applyWrites,
  removeLeftovers,
  TargetChangedError,
  type ApplyHooks,
} from "../core/writer.js";

export interface PlanRequest {
  paths: string[];
  plan: (files: Awaited<ReturnType<typeof readTargetFiles>>) => Plan;
}

export interface MutateOptions {
  command: string;
  cwd: string;
  json: boolean;
  dryRun: boolean;
  hooks?: ApplyHooks;
  /**
   * Builds the plan request once the registry and manifest are loaded, or returns diagnostics
   * that end the command before anything is read from the target.
   */
  prepare: (ctx: {
    registry: PackagedRegistry;
    manifest: Manifest | undefined;
    cliVersion: string;
  }) => Promise<PlanRequest | Diagnostic[]>;
}

export interface MutateData {
  dryRun: boolean;
  applied: boolean;
  changes: PlannedChange[];
}

const WIDTH = 9;
const PENDING = new Set(["create", "update", "delete", "adopt", "release"]);

export function renderChanges(target: string, data: MutateData): string {
  const lines = [`Target: ${target}`];
  for (const c of data.changes) {
    const version =
      c.fromVersion && c.toVersion && c.fromVersion !== c.toVersion
        ? `@${c.fromVersion} → ${c.toVersion}`
        : c.toVersion || c.fromVersion
          ? `@${c.toVersion ?? c.fromVersion}`
          : "";
    const detail = [
      c.itemId && `${c.itemId}${version}`,
      c.kind === "managed-block" && "managed block",
      c.reason,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`  ${c.action.padEnd(WIDTH)} ${c.destination}${detail ? `  (${detail})` : ""}`);
  }
  const pending = data.changes.filter((c) => PENDING.has(c.action)).length;
  const conflicts = data.changes.some((c) => c.action === "conflict");
  lines.push("");
  if (data.dryRun) lines.push(`Dry run: ${pending} change(s) planned; nothing was written.`);
  else if (data.applied) {
    lines.push(`Applied ${pending} change(s). Review them with: git status && git diff`);
    if (conflicts) lines.push("Items with conflicts were skipped; see below.");
  } else if (conflicts) lines.push("Nothing was written because of conflicts; see below.");
  else lines.push("No changes.");
  return lines.join("\n");
}

/** Shared flow for mutating commands: lock, read, plan, then apply or preview. */
export async function mutate(options: MutateOptions): Promise<number> {
  const { command, json, dryRun } = options;
  const done = (target: string | null, diagnostics: Diagnostic[], data?: MutateData) =>
    emit({ command, target, diagnostics, ...(data ? { data } : {}) }, json, (d) =>
      renderChanges(target ?? "", d),
    );

  const loaded = await loadPackagedRegistry(BUNDLED_REGISTRY_DIR);
  if (!loaded.value || loaded.diagnostics.length > 0) return done(null, loaded.diagnostics);
  const registry = loaded.value;

  const { root, diagnostics: targetDiagnostics } = await resolveTarget(options.cwd);
  if (!root) return done(null, targetDiagnostics);

  let lock: Lock | undefined;
  if (!dryRun) {
    const acquired = await acquireLock(root, command);
    if (!acquired.lock) return done(root, acquired.diagnostics);
    lock = acquired.lock;
  }

  let removeStateDir = false;
  try {
    const { manifest, diagnostics: manifestDiagnostics } = await readManifest(root);
    if (manifestDiagnostics.length > 0) return done(root, manifestDiagnostics);

    const request = await options.prepare({ registry, manifest, cliVersion: CLI_VERSION });
    if (Array.isArray(request)) return done(root, request);
    const plan = request.plan(await readTargetFiles(root, request.paths));

    const data: MutateData = { dryRun, applied: false, changes: plan.changes };
    const hasConflicts = plan.diagnostics.some((d) => d.severity === "conflict");
    const hasErrors = plan.diagnostics.some((d) => d.severity === "error");
    // A terminated predecessor's staging files are removed once the target is consistent.
    const cleanUp = async () => {
      if (lock?.takenOverFrom !== undefined) {
        await removeLeftovers(root, [...request.paths, MANIFEST_PATH], lock.takenOverFrom);
      }
    };

    if (dryRun || hasErrors || (hasConflicts && !plan.partial)) {
      return done(root, plan.diagnostics, data);
    }
    if (plan.writes.length === 0 && !plan.manifestChanged) {
      await cleanUp();
      return done(root, plan.diagnostics, data);
    }

    try {
      await applyWrites(
        root,
        {
          writes: plan.writes,
          manifest: !plan.manifestChanged
            ? undefined
            : plan.manifest === null
              ? null
              : serializeManifest(plan.manifest),
          pruneDirs: plan.pruneDirs,
        },
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
    removeStateDir = plan.manifest === null;
    return done(root, plan.diagnostics, { ...data, applied: true });
  } finally {
    await lock?.release();
    // After uninstall the state directory holds nothing once the lock is gone.
    if (removeStateDir) await rmdir(resolveIn(root, STATE_DIR)).catch(() => undefined);
  }
}
