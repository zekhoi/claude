import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

/** Small state and configuration files (manifests, locks, workspace files) stay under this size. */
export const SMALL_FILE_MAX = 1024 * 1024;

export type SafeRead =
  { state: "missing" } | { state: "file"; text: string } | { state: "unsafe"; reason: string };

/**
 * Reads a regular file without following a symlink at the final component, refusing FIFOs,
 * devices, directories, and files over `maxBytes`. Never blocks on special files.
 */
export async function readRegularFile(abs: string, maxBytes = SMALL_FILE_MAX): Promise<SafeRead> {
  let info;
  try {
    info = await lstat(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
    throw e;
  }
  if (info.isSymbolicLink()) return { state: "unsafe", reason: "is a symlink" };
  if (!info.isFile()) return { state: "unsafe", reason: "is not a regular file" };
  if (info.size > maxBytes) return { state: "unsafe", reason: `is larger than ${maxBytes} bytes` };
  // O_NOFOLLOW closes the window between lstat and open where it exists (not on Windows).
  const handle = await open(abs, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const text = await handle.readFile("utf8");
    if (Buffer.byteLength(text) > maxBytes) {
      return { state: "unsafe", reason: `is larger than ${maxBytes} bytes` };
    }
    return { state: "file", text };
  } finally {
    await handle.close();
  }
}
