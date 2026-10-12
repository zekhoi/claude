import { constants } from "node:fs";
import { copyFile, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MANIFEST_PATH } from "./manifest.js";
import type { WriteOp } from "./planner.js";
import { readTargetFile, resolveIn } from "./target.js";

/** A destination changed between planning and writing; nothing was left modified. */
export class TargetChangedError extends Error {
  constructor(readonly destination: string) {
    super(`${destination} changed while the command was running`);
  }
}

export interface ApplyHooks {
  /** Called before each mutation step; tests use it to inject failures or termination. */
  onStep?: (step: string) => void;
}

interface Staged {
  op: WriteOp;
  abs: string;
  tmp: string;
  backup?: string;
  committed: boolean;
}

/**
 * Applies planned writes, then the manifest. New content is staged beside each destination,
 * replaced files are backed up, and any failure before the manifest is written restores the
 * previous state. The manifest is written last so it never records changes that did not happen.
 */
export async function applyWrites(
  root: string,
  writes: readonly WriteOp[],
  manifest: string | undefined,
  hooks: ApplyHooks = {},
): Promise<void> {
  const step = hooks.onStep ?? (() => undefined);
  const suffix = `.agent-kit-${process.pid}`;
  const staged: Staged[] = [];
  const createdDirs: string[] = [];

  const stage = async (destination: string, content: string): Promise<string> => {
    const abs = resolveIn(root, destination);
    const created = await mkdir(path.dirname(abs), { recursive: true });
    if (created !== undefined) createdDirs.push(created);
    const tmp = `${abs}${suffix}.tmp`;
    await writeFile(tmp, content, { flag: "wx" });
    return tmp;
  };

  try {
    for (const op of writes) {
      step(`stage ${op.destination}`);
      const abs = resolveIn(root, op.destination);
      // Push before writing so a partially written staging file is still cleaned up.
      const entry: Staged = { op, abs, tmp: `${abs}${suffix}.tmp`, committed: false };
      staged.push(entry);
      entry.tmp = await stage(op.destination, op.content);
    }

    for (const entry of staged) {
      step(`commit ${entry.op.destination}`);
      const current = await readTargetFile(root, entry.op.destination);
      const unchanged =
        entry.op.expected === "missing"
          ? current.state === "missing"
          : current.state === "file" && current.rawHash === entry.op.expected;
      if (!unchanged) throw new TargetChangedError(entry.op.destination);
      if (current.state === "file") {
        entry.backup = `${entry.abs}${suffix}.bak`;
        await copyFile(entry.abs, entry.backup, constants.COPYFILE_EXCL);
      }
      await rename(entry.tmp, entry.abs);
      entry.committed = true;
    }

    if (manifest !== undefined) {
      step("manifest");
      const tmp = await stage(MANIFEST_PATH, manifest);
      try {
        await rename(tmp, resolveIn(root, MANIFEST_PATH));
      } catch (e) {
        await unlink(tmp).catch(() => undefined);
        throw e;
      }
    }
  } catch (e) {
    await rollback(staged, createdDirs);
    throw e;
  }

  for (const entry of staged) {
    if (entry.backup) await unlink(entry.backup).catch(() => undefined);
  }
}

async function rollback(staged: readonly Staged[], createdDirs: readonly string[]): Promise<void> {
  const ignore = () => undefined;
  for (const entry of [...staged].reverse()) {
    if (entry.committed) {
      if (entry.backup) await rename(entry.backup, entry.abs).catch(ignore);
      else await unlink(entry.abs).catch(ignore);
    } else {
      await unlink(entry.tmp).catch(ignore);
      if (entry.backup) await unlink(entry.backup).catch(ignore);
    }
  }
  // Directories created by this command contain only files it wrote.
  for (const dir of [...createdDirs].reverse()) await rm(dir, { recursive: true, force: true });
}

/** Removes staging and backup files left beside `destinations` by a terminated process. */
export async function removeLeftovers(
  root: string,
  destinations: Iterable<string>,
  pid: number,
): Promise<void> {
  for (const destination of new Set(destinations)) {
    const abs = resolveIn(root, destination);
    for (const ext of ["tmp", "bak"])
      await unlink(`${abs}.agent-kit-${pid}.${ext}`).catch(() => undefined);
  }
}
