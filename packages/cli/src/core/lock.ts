import { constants } from "node:fs";
import { mkdir, open, realpath, rmdir, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { conflict, error, type Diagnostic } from "./diagnostics.js";
import { checkStateDir, LOCK_PATH, STATE_DIR } from "./manifest.js";
import { readRegularFile } from "./safe-read.js";
import { resolveIn } from "./target.js";

export interface LockInfo {
  pid: number;
  host: string;
  startedAt: string;
  command: string;
}

export interface Lock {
  /** Process id of a dead holder whose lock was taken over, if any. */
  readonly takenOverFrom?: number;
  release(): Promise<void>;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Reads the current lock holder without acquiring it; `null` means no lock file exists. */
export async function inspectLock(
  root: string,
): Promise<{ holder: LockInfo | undefined; alive: boolean | undefined } | null> {
  const file = resolveIn(root, LOCK_PATH);
  if (
    (await readRegularFile(file, 64 * 1024).catch(() => ({ state: "missing" as const }))).state ===
    "missing"
  ) {
    return null;
  }
  const holder = await readLock(file);
  const alive = holder && holder.host === hostname() ? isProcessAlive(holder.pid) : undefined;
  return { holder, alive };
}

async function readLock(file: string): Promise<LockInfo | undefined> {
  try {
    const read = await readRegularFile(file, 64 * 1024);
    return read.state === "file" ? (JSON.parse(read.text) as LockInfo) : undefined;
  } catch {
    return undefined;
  }
}

function lockHeld(info: LockInfo | undefined): Diagnostic {
  const owner = info
    ? `${info.command} (pid ${info.pid} on ${info.host}, started ${info.startedAt})`
    : "an unknown process";
  return conflict("LOCK_HELD", `another agent-kit command holds the project lock: ${owner}`, {
    path: LOCK_PATH,
    action:
      "Wait for it to finish. If no agent-kit command is running, delete .agent-kit/lock and rerun.",
  });
}

/**
 * Acquires the project lock. A lock is taken over only when it names a process on this host that
 * is confirmed dead; age alone never makes a lock stale.
 */
export async function acquireLock(
  root: string,
  command: string,
): Promise<{ lock?: Lock; diagnostics: Diagnostic[] }> {
  const dir = resolveIn(root, STATE_DIR);
  const file = resolveIn(root, LOCK_PATH);
  const unsafe = await checkStateDir(root);
  if (unsafe) return { diagnostics: [unsafe] };
  const createdDir = (await mkdir(dir, { recursive: true })) !== undefined;
  // Re-check after creating: the directory must resolve inside the target.
  const real = await realpath(dir);
  const relative = path.relative(await realpath(root), real);
  if (relative.startsWith("..") || path.isAbsolute(relative) || (await checkStateDir(root))) {
    return {
      diagnostics: [
        error("UNSAFE_PATH", `${STATE_DIR} resolves outside the target`, { path: STATE_DIR }),
      ],
    };
  }
  const info: LockInfo = {
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    command,
  };

  let takenOverFrom: number | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Exclusive create that never follows a symlink planted at the lock path.
      const handle = await open(
        file,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
        0o644,
      );
      await handle.writeFile(`${JSON.stringify(info)}\n`);
      await handle.close();
      return {
        lock: {
          ...(takenOverFrom === undefined ? {} : { takenOverFrom }),
          async release() {
            await unlink(file).catch(() => undefined);
            if (createdDir) await rmdir(path.dirname(file)).catch(() => undefined);
          },
        },
        diagnostics: [],
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const holder = await readLock(file);
      const stale =
        attempt === 0 &&
        holder !== undefined &&
        holder.host === info.host &&
        holder.pid !== process.pid &&
        !isProcessAlive(holder.pid);
      if (!stale) return { diagnostics: [lockHeld(holder)] };
      takenOverFrom = holder.pid;
      await unlink(file).catch(() => undefined);
    }
  }
  return { diagnostics: [lockHeld(await readLock(file))] };
}
