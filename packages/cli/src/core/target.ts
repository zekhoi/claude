import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { decodeUtf8 } from "./content.js";
import { error, type Diagnostic } from "./diagnostics.js";
import { isSafeRelativePath } from "./paths.js";

export type FileState =
  /** `missingDirs`: target-relative ancestor directories that do not exist, shallowest first. */
  | { state: "missing"; missingDirs?: string[] }
  | { state: "file"; text: string; rawHash: string }
  | { state: "unsafe"; reason: string };

export function rawHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Converts a forward-slash relative path to an absolute path under the target root. */
export function resolveIn(root: string, rel: string): string {
  return path.join(root, ...rel.split("/"));
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Resolves and validates the installation target: an existing directory, used as-is. */
export async function resolveTarget(
  cwd: string,
): Promise<{ root?: string; diagnostics: Diagnostic[] }> {
  const abs = path.resolve(cwd);
  try {
    if (!(await stat(abs)).isDirectory()) {
      return { diagnostics: [error("TARGET_INVALID", "target is not a directory", { path: abs })] };
    }
    return { root: await realpath(abs), diagnostics: [] };
  } catch {
    return { diagnostics: [error("TARGET_INVALID", "target does not exist", { path: abs })] };
  }
}

/**
 * Reads a target-relative file. Paths whose existing ancestors resolve outside the target, and
 * destinations that are themselves symlinks or non-files, are reported as unsafe.
 */
export async function readTargetFile(root: string, rel: string): Promise<FileState> {
  if (!isSafeRelativePath(rel)) return { state: "unsafe", reason: "path escapes the target" };
  const abs = resolveIn(root, rel);

  let ancestor = path.dirname(abs);
  const missingDirs: string[] = [];
  for (;;) {
    try {
      const real = await realpath(ancestor);
      if (!isInside(root, real)) {
        return { state: "unsafe", reason: "a parent directory resolves outside the target" };
      }
      if (!(await stat(real)).isDirectory()) {
        return { state: "unsafe", reason: "a parent path is not a directory" };
      }
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      missingDirs.unshift(path.relative(root, ancestor).split(path.sep).join("/"));
      ancestor = path.dirname(ancestor);
    }
  }

  let info;
  try {
    info = await lstat(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return missingDirs.length > 0 ? { state: "missing", missingDirs } : { state: "missing" };
    }
    throw e;
  }
  if (info.isSymbolicLink()) return { state: "unsafe", reason: "destination is a symlink" };
  if (!info.isFile()) return { state: "unsafe", reason: "destination is not a regular file" };

  const text = decodeUtf8(await readFile(abs));
  if (text === undefined) return { state: "unsafe", reason: "file is not valid UTF-8" };
  return { state: "file", text, rawHash: rawHash(text) };
}

export async function readTargetFiles(
  root: string,
  rels: Iterable<string>,
): Promise<Map<string, FileState>> {
  const files = new Map<string, FileState>();
  for (const rel of new Set(rels)) files.set(rel, await readTargetFile(root, rel));
  return files;
}
