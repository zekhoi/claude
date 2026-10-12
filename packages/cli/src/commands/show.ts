import path from "node:path";
import { AGENTS_MD } from "../adapters/claude.js";
import { parseBlock } from "../core/blocks.js";
import { error, type Diagnostic } from "../core/diagnostics.js";
import { unifiedDiff } from "../core/diff.js";
import { readManifest } from "../core/manifest.js";
import { emit } from "../core/output.js";
import { composeAgentsBody } from "../core/planner.js";
import { loadPackagedRegistry } from "../core/registry.js";
import { BUNDLED_REGISTRY_DIR } from "../core/runtime.js";
import type { PackagedItem } from "../core/schemas.js";
import { readTargetFile, resolveTarget } from "../core/target.js";

interface ShowFile {
  destination: string;
  packagedPath: string;
  sha256: string;
  content?: string;
  /** With `--diff`: how the target differs from the bundled version; empty when identical. */
  diff?: string;
  /** With `--diff`: the state of the destination in the target. */
  local?: "identical" | "different" | "missing" | "unsafe";
}

interface ShowData {
  id: string;
  version: string;
  description: string;
  files: ShowFile[];
}

/** What the target holds at a destination: the whole file, or the managed block body. */
async function localContent(
  root: string,
  destination: string,
  install: string,
): Promise<{ text?: string; state: "present" | "missing" | "unsafe" }> {
  const state = await readTargetFile(root, destination);
  if (state.state !== "file") return { state: state.state };
  if (install !== "managed-block") return { text: state.text, state: "present" };
  const parsed = parseBlock(state.text);
  return parsed.kind === "block" ? { text: parsed.body, state: "present" } : { state: "missing" };
}

/** Compares an item's installed files with the bundled version. */
async function diffItem(
  cwd: string,
  item: PackagedItem,
  contents: ReadonlyMap<string, string>,
  files: ShowFile[],
): Promise<Diagnostic[]> {
  const { root, diagnostics } = await resolveTarget(cwd);
  if (!root) return diagnostics;
  const { manifest, diagnostics: manifestDiagnostics } = await readManifest(root);
  if (manifestDiagnostics.length > 0) return manifestDiagnostics;

  for (const file of files) {
    const entry = item.files.find((f) => f.destination === file.destination)!;
    let bundled = contents.get(entry.source)!;
    // The AGENTS.md block also carries the project context reference when one is configured.
    if (entry.install === "managed-block" && entry.destination === AGENTS_MD) {
      bundled = composeAgentsBody([bundled], manifest?.contextPath);
    }
    const local = await localContent(root, entry.destination, entry.install);
    if (local.state === "unsafe") {
      file.local = "unsafe";
      continue;
    }
    const where =
      entry.install === "managed-block"
        ? `${entry.destination} (managed block)`
        : entry.destination;
    file.diff = unifiedDiff(local.text ?? "", bundled, {
      from: local.state === "missing" ? `${where} (missing)` : `${where} (yours)`,
      to: `${where} (bundled ${item.version})`,
    });
    file.local =
      local.state === "missing" ? "missing" : file.diff === "" ? "identical" : "different";
  }
  return [];
}

function render(d: ShowData, options: { file?: string; diff: boolean }): string {
  if (options.diff) {
    return d.files
      .map((f) =>
        f.local === "identical"
          ? `${f.destination}: identical to the bundled version`
          : f.local === "unsafe"
            ? `${f.destination}: not compared (symlink, not a regular file, or outside the target)`
            : f.diff!,
      )
      .join("\n\n");
  }
  if (options.file !== undefined) return (d.files[0]?.content ?? "").replace(/\n$/, "");
  return [
    `${d.id}@${d.version}  ${d.description}`,
    ...d.files.map((f) => `  ${f.destination}\n    bundled at ${f.packagedPath}`),
  ].join("\n");
}

/** Prints an item's bundled files, or how the target differs from them, for manual comparison. */
export async function show(
  id: string,
  options: { json: boolean; cwd: string; file?: string; diff: boolean },
): Promise<number> {
  const done = (diagnostics: Diagnostic[], target: string | null, data?: ShowData) =>
    emit({ command: "show", target, diagnostics, ...(data ? { data } : {}) }, options.json, (d) =>
      render(d, options),
    );

  const loaded = await loadPackagedRegistry(BUNDLED_REGISTRY_DIR);
  if (!loaded.value || loaded.diagnostics.length > 0) return done(loaded.diagnostics, null);
  const { index, contents, root } = loaded.value;

  const item = index.items.find((i) => i.id === id);
  if (!item) {
    return done(
      [
        error("UNKNOWN_ITEM", `${id} is not in the catalog bundled with this CLI`, {
          action: "Run `agent-kit list` to see available items",
        }),
      ],
      null,
    );
  }
  const selected =
    options.file === undefined
      ? item.files
      : item.files.filter((f) => f.destination === options.file);
  if (selected.length === 0) {
    return done(
      [
        error("UNKNOWN_ITEM", `${id} has no file with destination ${options.file}`, {
          action: `Use one of: ${item.files.map((f) => f.destination).join(", ")}`,
        }),
      ],
      null,
    );
  }
  const files: ShowFile[] = selected.map((f) => ({
    destination: f.destination,
    packagedPath: path.join(root, ...f.source.split("/")),
    sha256: f.sha256,
    ...((options.file !== undefined || options.json) && !options.diff
      ? { content: contents.get(f.source)! }
      : {}),
  }));
  const data: ShowData = {
    id: item.id,
    version: item.version,
    description: item.description,
    files,
  };

  if (!options.diff) return done([], null, data);
  const diagnostics = await diffItem(options.cwd, item, contents, files);
  const target = path.resolve(options.cwd);
  return diagnostics.length > 0 ? done(diagnostics, target) : done([], target, data);
}
