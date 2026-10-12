import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZodError, ZodType } from "zod";
import { validateContent, validateItemFiles } from "../adapters/claude.js";
import { renderItem, validateRendered } from "../adapters/index.js";
import { contentHash, decodeUtf8 } from "./content.js";
import { validateQuality } from "./quality.js";
import { error, hasErrors, type Diagnostic } from "./diagnostics.js";
import { collisionKey, isSafeRelativePath } from "./paths.js";
import {
  PackagedIndexSchema,
  PresetSchema,
  REGISTRY_SCHEMA_VERSION,
  SourceIndexSchema,
  type PackagedIndex,
  type PackagedItem,
  type Preset,
  type RegistryItem,
} from "./schemas.js";

export interface SourceRegistry {
  items: RegistryItem[];
  presets: Preset[];
  /** Decoded file contents keyed by registry-relative source path. */
  contents: Map<string, string>;
}

export interface LoadResult<T> {
  value?: T;
  diagnostics: Diagnostic[];
}

function zodDiagnostics(err: ZodError, rel: string): Diagnostic[] {
  return err.issues.map((issue) =>
    error("SCHEMA_INVALID", `${issue.path.join(".") || "(root)"}: ${issue.message}`, { path: rel }),
  );
}

/** Reads and parses a JSON document, rejecting newer schema versions before full validation. */
async function readVersionedJson<T>(
  file: string,
  rel: string,
  schema: ZodType<T>,
): Promise<LoadResult<T>> {
  let data: unknown;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return {
      diagnostics: [
        missing
          ? error("MISSING_SOURCE", "file not found", { path: rel })
          : error("SCHEMA_INVALID", `invalid JSON: ${(e as Error).message}`, { path: rel }),
      ],
    };
  }
  const version = (data as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === "number" && version > REGISTRY_SCHEMA_VERSION) {
    return {
      diagnostics: [
        error(
          "UNSUPPORTED_SCHEMA",
          `registry schema ${version} is newer than supported ${REGISTRY_SCHEMA_VERSION}`,
          { path: rel, action: "Use a newer agent-kit release" },
        ),
      ],
    };
  }
  const parsed = schema.safeParse(data);
  return parsed.success
    ? { value: parsed.data, diagnostics: [] }
    : { diagnostics: zodDiagnostics(parsed.error, rel) };
}

/** Reads a registry file, refusing unsafe paths, symlinked segments, and non-UTF-8 content. */
async function readRegistryFile(root: string, rel: string): Promise<LoadResult<string>> {
  if (!isSafeRelativePath(rel)) {
    return {
      diagnostics: [error("UNSAFE_PATH", "source path escapes the registry", { path: rel })],
    };
  }
  let current = root;
  for (const segment of rel.split("/")) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        return {
          diagnostics: [error("UNSAFE_PATH", "registry files must not be symlinks", { path: rel })],
        };
      }
    } catch {
      return { diagnostics: [error("MISSING_SOURCE", "source file not found", { path: rel })] };
    }
  }
  const text = decodeUtf8(await readFile(current));
  return text === undefined
    ? { diagnostics: [error("INVALID_ENCODING", "file is not valid UTF-8", { path: rel })] }
    : { value: text, diagnostics: [] };
}

/** Cross-item checks shared by source and packaged registries. */
function validateCatalog(
  items: readonly RegistryItem[],
  presets: readonly Preset[],
  contents: ReadonlyMap<string, string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();
  const destinations = new Map<string, string>();

  for (const item of items) {
    if (ids.has(item.id)) diagnostics.push(error("DUPLICATE_ID", `duplicate item ${item.id}`));
    ids.add(item.id);
    if (!item.id.startsWith(`${item.type}/`)) {
      diagnostics.push(error("ID_TYPE_MISMATCH", `${item.id} has type "${item.type}"`));
    }
    if (item.dependencies.length > 0) {
      diagnostics.push(
        error("UNSUPPORTED_DEPENDENCIES", `${item.id} declares dependencies`, {
          action: "Item dependencies are not supported yet; keep `dependencies` empty",
        }),
      );
    }
    const before = diagnostics.length;
    diagnostics.push(...validateItemFiles(item));
    for (const file of item.files) {
      const content = contents.get(file.source);
      if (content !== undefined) diagnostics.push(...validateContent(item, file, content));
    }
    // Other agents' renderings are checked only for valid items, so one source problem is
    // reported once.
    if (diagnostics.length === before && item.files.every((f) => contents.has(f.source))) {
      for (const file of renderItem(item as PackagedItem, contents, ["codex"])) {
        diagnostics.push(...validateRendered(item as PackagedItem, file, "codex"));
        if (file.install === "managed-block") continue;
        const key = `codex\0${collisionKey(file.destination)}`;
        const owner = destinations.get(key);
        if (owner !== undefined) {
          diagnostics.push(
            error("DESTINATION_COLLISION", `${item.id} and ${owner} share a Codex destination`, {
              path: file.destination,
            }),
          );
        }
        destinations.set(key, item.id);
      }
    }
    for (const file of item.files) {
      const key = collisionKey(file.destination);
      const owner = destinations.get(key);
      if (owner !== undefined) {
        diagnostics.push(
          error("DESTINATION_COLLISION", `${item.id} and ${owner} share a destination`, {
            path: file.destination,
          }),
        );
      }
      destinations.set(key, item.id);
      const content = contents.get(file.source);
      if (content !== undefined) diagnostics.push(...validateQuality(item, file, content));
    }
  }

  const presetIds = new Set<string>();
  for (const preset of presets) {
    if (presetIds.has(preset.id)) {
      diagnostics.push(error("DUPLICATE_ID", `duplicate preset ${preset.id}`));
    }
    presetIds.add(preset.id);
    for (const ref of preset.items) {
      if (!ids.has(ref)) {
        diagnostics.push(
          error("UNKNOWN_PRESET_ITEM", `${preset.id} references unavailable item ${ref}`),
        );
      }
    }
  }
  return diagnostics;
}

/** Loads and validates the source registry checked into this repository. */
export async function loadSourceRegistry(root: string): Promise<LoadResult<SourceRegistry>> {
  const diagnostics: Diagnostic[] = [];
  const index = await readVersionedJson(
    path.join(root, "index.json"),
    "index.json",
    SourceIndexSchema,
  );
  diagnostics.push(...index.diagnostics);

  const presets: Preset[] = [];
  const presetFiles = (await readdir(path.join(root, "presets")).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of presetFiles) {
    const rel = `presets/${file}`;
    const result = await readVersionedJson(path.join(root, rel), rel, PresetSchema);
    diagnostics.push(...result.diagnostics);
    if (!result.value) continue;
    if (result.value.id !== `preset/${path.basename(file, ".json")}`) {
      diagnostics.push(
        error("SCHEMA_INVALID", `preset id must match its file name`, { path: rel }),
      );
    }
    presets.push(result.value);
  }
  if (!index.value) return { diagnostics };

  const contents = new Map<string, string>();
  for (const file of index.value.items.flatMap((i) => i.files)) {
    const result = await readRegistryFile(root, file.source);
    diagnostics.push(...result.diagnostics);
    if (result.value !== undefined) contents.set(file.source, result.value);
  }
  // Required attribution notices for reused content must exist so the build can ship them.
  for (const item of index.value.items) {
    if (item.provenance?.notice) {
      diagnostics.push(...(await readRegistryFile(root, item.provenance.notice)).diagnostics);
    }
  }
  diagnostics.push(...validateCatalog(index.value.items, presets, contents));
  return { value: { items: index.value.items, presets, contents }, diagnostics };
}

/**
 * Validates the source registry and writes the packaged form: item files copied byte-for-byte,
 * templates copied, and an index carrying build-generated checksums.
 */
export async function buildRegistry(sourceRoot: string, outDir: string): Promise<Diagnostic[]> {
  const { value, diagnostics } = await loadSourceRegistry(sourceRoot);
  if (!value || hasErrors(diagnostics)) return diagnostics;

  await rm(outDir, { recursive: true, force: true });
  const copy = async (rel: string) => {
    const dest = path.join(outDir, ...rel.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(sourceRoot, ...rel.split("/")), dest);
  };

  const index: PackagedIndex = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    items: [...value.items]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => ({
        ...item,
        files: item.files.map((f) => ({
          ...f,
          sha256: contentHash(value.contents.get(f.source)!),
        })),
      })),
    presets: [...value.presets].sort((a, b) => a.id.localeCompare(b.id)),
  };
  for (const file of value.items.flatMap((i) => i.files)) await copy(file.source);
  for (const item of value.items) if (item.provenance?.notice) await copy(item.provenance.notice);

  const templates = await readdir(path.join(sourceRoot, "templates"), {
    withFileTypes: true,
  }).catch(() => []);
  for (const entry of templates) {
    if (!entry.isFile()) {
      diagnostics.push(
        error("UNSAFE_PATH", "templates/ may contain only regular files", {
          path: `templates/${entry.name}`,
        }),
      );
      continue;
    }
    await copy(`templates/${entry.name}`);
  }

  await writeFile(path.join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return diagnostics;
}

/** Loads the registry bundled with the CLI and verifies every file against its checksum. */
export interface PackagedRegistry {
  root: string;
  index: PackagedIndex;
  /** Decoded file contents keyed by registry-relative source path. */
  contents: Map<string, string>;
}

export async function loadPackagedRegistry(root: string): Promise<LoadResult<PackagedRegistry>> {
  const index = await readVersionedJson(
    path.join(root, "index.json"),
    "index.json",
    PackagedIndexSchema,
  );
  if (!index.value) return { diagnostics: index.diagnostics };

  const diagnostics: Diagnostic[] = [];
  const contents = new Map<string, string>();
  for (const file of index.value.items.flatMap((i) => i.files)) {
    const result = await readRegistryFile(root, file.source);
    diagnostics.push(...result.diagnostics);
    if (result.value === undefined) continue;
    contents.set(file.source, result.value);
    if (contentHash(result.value) !== file.sha256) {
      diagnostics.push(
        error("CHECKSUM_MISMATCH", "bundled file does not match its recorded checksum", {
          path: file.source,
          action: "Reinstall the CLI package",
        }),
      );
    }
  }
  diagnostics.push(...validateCatalog(index.value.items, index.value.presets, contents));
  return { value: { root, index: index.value, contents }, diagnostics };
}

/** Reads a bundled template such as `agent-context.md`. */
export async function readTemplate(registry: PackagedRegistry, name: string): Promise<string> {
  const result = await readRegistryFile(registry.root, `templates/${name}`);
  if (result.value === undefined) {
    throw new Error(`bundled template ${name} is unavailable: ${result.diagnostics[0]?.message}`);
  }
  return result.value;
}
