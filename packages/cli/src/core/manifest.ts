import { lstat } from "node:fs/promises";
import { BLOCK_FILES, isItemDestination, isManagedDirectory } from "../adapters/index.js";
import { isSafeRelativePath } from "./paths.js";
import { readRegularFile } from "./safe-read.js";
import { error, type Diagnostic } from "./diagnostics.js";
import { MANIFEST_SCHEMA_VERSION, ManifestSchema, type Manifest } from "./schemas.js";
import { resolveIn } from "./target.js";

export const STATE_DIR = ".agent-kit";
export const MANIFEST_PATH = `${STATE_DIR}/manifest.json`;
export const LOCK_PATH = `${STATE_DIR}/lock`;
/** The only project context file agent-kit references. */
export const CONTEXT_FILE = "docs/agent-context.md";

export function emptyManifest(
  cliVersion: string,
  agents: Manifest["agents"] = ["claude"],
  scope: Manifest["scope"] = "project",
): Manifest {
  return {
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    cliVersion,
    scope,
    agents,
    presets: [],
    items: {},
    blocks: {},
    createdDirs: [],
  };
}

export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Reads the target manifest. A missing manifest is not an error; newer schemas are rejected. */
export async function readManifest(
  root: string,
): Promise<{ manifest?: Manifest; diagnostics: Diagnostic[] }> {
  const at = { path: MANIFEST_PATH };
  const stateDir = await checkStateDir(root);
  if (stateDir) return { diagnostics: [stateDir] };
  const read = await readRegularFile(resolveIn(root, MANIFEST_PATH));
  if (read.state === "missing") return { diagnostics: [] };
  if (read.state === "unsafe") {
    return {
      diagnostics: [
        error("MANIFEST_INVALID", `the manifest ${read.reason}`, {
          ...at,
          action: "Replace .agent-kit/manifest.json with a regular file from version control",
        }),
      ],
    };
  }
  const raw = read.text;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      diagnostics: [
        error("MANIFEST_INVALID", "manifest is not valid JSON", {
          ...at,
          action: "Restore .agent-kit/manifest.json from version control",
        }),
      ],
    };
  }
  const version = (data as { manifestSchemaVersion?: unknown } | null)?.manifestSchemaVersion;
  if (typeof version === "number" && version > MANIFEST_SCHEMA_VERSION) {
    return {
      diagnostics: [
        error(
          "UNSUPPORTED_SCHEMA",
          `manifest schema ${version} is newer than supported ${MANIFEST_SCHEMA_VERSION}`,
          { ...at, action: "Run a newer agent-kit release (npx <package>@latest)" },
        ),
      ],
    };
  }
  const parsed = ManifestSchema.safeParse(data);
  if (!parsed.success) {
    return {
      diagnostics: parsed.error.issues.map((issue) =>
        error("MANIFEST_INVALID", `${issue.path.join(".") || "(root)"}: ${issue.message}`, at),
      ),
    };
  }
  const unmanaged = unmanagedPaths(parsed.data);
  if (unmanaged.length > 0) {
    return {
      diagnostics: unmanaged.map((p) =>
        error("MANIFEST_INVALID", `the manifest lists a path agent-kit never manages: ${p}`, {
          ...at,
          action: "Restore .agent-kit/manifest.json from version control; do not edit it by hand",
        }),
      ),
    };
  }
  return { manifest: parsed.data, diagnostics: [] };
}

/**
 * Paths in a manifest that agent-kit could never have written. A manifest comes from the target
 * repository and is untrusted: without this check it could direct writes, deletions, or directory
 * removal at any file.
 */
export function unmanagedPaths(manifest: Manifest): string[] {
  const bad: string[] = [];
  for (const [id, entry] of Object.entries(manifest.items)) {
    for (const file of entry.files) {
      if (
        !isSafeRelativePath(file.destination) ||
        !isItemDestination(id, file.destination, file.install)
      ) {
        bad.push(file.destination);
      }
    }
  }
  for (const destination of Object.keys(manifest.blocks)) {
    if (!BLOCK_FILES.includes(destination)) bad.push(destination);
  }
  for (const dir of manifest.createdDirs) {
    if (!isSafeRelativePath(dir) || !isManagedDirectory(dir)) bad.push(dir);
  }
  if (manifest.contextPath !== undefined && manifest.contextPath !== CONTEXT_FILE) {
    bad.push(manifest.contextPath);
  }
  return [...new Set(bad)];
}

/** `.agent-kit` must be a real directory inside the target, never a symlink or a file. */
export async function checkStateDir(root: string): Promise<Diagnostic | undefined> {
  try {
    const info = await lstat(resolveIn(root, STATE_DIR));
    if (info.isSymbolicLink() || !info.isDirectory()) {
      return error("UNSAFE_PATH", `${STATE_DIR} must be a real directory, not a symlink or file`, {
        path: STATE_DIR,
        action: `Remove ${STATE_DIR} and rerun`,
      });
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return undefined;
}
