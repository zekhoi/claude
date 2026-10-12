import { readFile } from "node:fs/promises";
import { error, type Diagnostic } from "./diagnostics.js";
import { MANIFEST_SCHEMA_VERSION, ManifestSchema, type Manifest } from "./schemas.js";
import { resolveIn } from "./target.js";

export const STATE_DIR = ".agent-kit";
export const MANIFEST_PATH = `${STATE_DIR}/manifest.json`;
export const LOCK_PATH = `${STATE_DIR}/lock`;

export function emptyManifest(
  cliVersion: string,
  agents: Manifest["agents"] = ["claude"],
): Manifest {
  return {
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    cliVersion,
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
  let raw: string;
  try {
    raw = await readFile(resolveIn(root, MANIFEST_PATH), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { diagnostics: [] };
    throw e;
  }
  const at = { path: MANIFEST_PATH };
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
  return { manifest: parsed.data, diagnostics: [] };
}
