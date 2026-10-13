import { constants } from "node:fs";
import { copyFile, mkdir, realpath, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MANIFEST_PATH } from "./manifest.js";
import { isSafeRelativePath } from "./paths.js";
import type { WriteOp } from "./plan-builder.js";
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

export interface ApplyInput {
  writes: readonly WriteOp[];
  /** Serialized manifest to write last, `null` to delete it last, or undefined to leave it. */
  manifest: string | null | undefined;
  /** Directories to remove after success if empty, deepest first. */
  pruneDirs?: readonly string[];
}

interface Staged {
  op: WriteOp;
  abs: string;
  tmp?: string;
  backup?: string;
  committed: boolean;
}

/**
 * Applies planned writes and deletions, then the manifest. New content is staged beside each
 * destination, replaced or deleted files are backed up, and any failure before the manifest step
 * completes restores the previous state. The manifest goes last so it never records changes that
 * did not happen.
 */
export async function applyWrites(
  root: string,
  input: ApplyInput,
  hooks: ApplyHooks = {},
): Promise<void> {
  const step = hooks.onStep ?? (() => undefined);
  const suffix = `.agent-kit-${process.pid}`;
  const staged: Staged[] = [];
  const createdDirs: string[] = [];

  const stage = async (abs: string, content: string): Promise<string> => {
    const created = await mkdir(path.dirname(abs), { recursive: true });
    if (created !== undefined) createdDirs.push(created);
    const tmp = `${abs}${suffix}.tmp`;
    await writeFile(tmp, content, { flag: "wx" });
    return tmp;
  };

  // The manifest is the final step, replaced or deleted like any other file.
  const manifestAbs = resolveIn(root, MANIFEST_PATH);
  let manifestEntry: Staged | undefined;

  try {
    for (const op of input.writes) {
      const entry: Staged = { op, abs: resolveIn(root, op.destination), committed: false };
      staged.push(entry);
      if (op.content === null) continue;
      step(`stage ${op.destination}`);
      entry.tmp = `${entry.abs}${suffix}.tmp`;
      await stage(entry.abs, op.content);
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
      if (entry.tmp) await rename(entry.tmp, entry.abs);
      else await unlink(entry.abs);
      entry.committed = true;
    }

    if (input.manifest !== undefined) {
      step("manifest");
      const current = await readTargetFile(root, MANIFEST_PATH);
      if (current.state === "unsafe") throw new TargetChangedError(MANIFEST_PATH);
      manifestEntry = {
        op: {
          destination: MANIFEST_PATH,
          content: input.manifest,
          expected: current.state === "file" ? current.rawHash : "missing",
        },
        abs: manifestAbs,
        committed: false,
      };
      if (current.state === "file") {
        manifestEntry.backup = `${manifestAbs}${suffix}.bak`;
        await copyFile(manifestAbs, manifestEntry.backup, constants.COPYFILE_EXCL);
      }
      if (input.manifest === null) {
        if (current.state === "file") await unlink(manifestAbs);
      } else {
        manifestEntry.tmp = await stage(manifestAbs, input.manifest);
        await rename(manifestEntry.tmp, manifestAbs);
      }
      manifestEntry.committed = true;
    }
  } catch (e) {
    await rollback(manifestEntry ? [...staged, manifestEntry] : staged, createdDirs);
    throw e;
  }

  for (const entry of manifestEntry ? [...staged, manifestEntry] : staged) {
    if (entry.backup) await unlink(entry.backup).catch(() => undefined);
  }
  for (const dir of input.pruneDirs ?? []) {
    if (await isContainedDirectory(root, dir)) {
      await rmdir(resolveIn(root, dir)).catch(() => undefined);
    }
  }
}

async function rollback(staged: readonly Staged[], createdDirs: readonly string[]): Promise<void> {
  const ignore = () => undefined;
  for (const entry of [...staged].reverse()) {
    if (entry.committed) {
      if (entry.backup) await rename(entry.backup, entry.abs).catch(ignore);
      else await unlink(entry.abs).catch(ignore);
    } else {
      if (entry.tmp) await unlink(entry.tmp).catch(ignore);
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
    if (!isSafeRelativePath(destination)) continue;
    const abs = resolveIn(root, destination);
    for (const ext of ["tmp", "bak"]) {
      await unlink(`${abs}.agent-kit-${pid}.${ext}`).catch(() => undefined);
    }
  }
}

/** True when `dir` is a safe relative path whose real location is inside the target. */
async function isContainedDirectory(root: string, dir: string): Promise<boolean> {
  if (!isSafeRelativePath(dir)) return false;
  try {
    const realRoot = await realpath(root);
    const relative = path.relative(realRoot, await realpath(resolveIn(root, dir)));
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}
