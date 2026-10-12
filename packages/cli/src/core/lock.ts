import { mkdir, open, readFile, rmdir, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { conflict, type Diagnostic } from "./diagnostics.js";
import { LOCK_PATH, STATE_DIR } from "./manifest.js";
import { resolveIn } from "./target.js";

interface LockInfo {
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

async function readLock(file: string): Promise<LockInfo | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as LockInfo;
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
  const createdDir = (await mkdir(dir, { recursive: true })) !== undefined;
  const info: LockInfo = {
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    command,
  };

  let takenOverFrom: number | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, "wx");
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
