import path from "node:path";
import { AGENTS_MD } from "../adapters/claude.js";
import { AGENT_IDS, renderItem, type AgentId, type RenderedFile } from "../adapters/index.js";
import { contentHash } from "../core/content.js";
import { parseBlock } from "../core/blocks.js";
import { error, type Diagnostic } from "../core/diagnostics.js";
import { unifiedDiff } from "../core/diff.js";
import { readManifest } from "../core/manifest.js";
import { agentsFor } from "../core/planner.js";
import { emit } from "../core/output.js";
import { composeAgentsBody } from "../core/planner.js";
import { loadPackagedRegistry } from "../core/registry.js";
import { BUNDLED_REGISTRY_DIR } from "../core/runtime.js";
import type { Manifest } from "../core/schemas.js";
import { checkScope, resolveWhere, scopeOf, type Where } from "../core/scope.js";
import { readTargetFile } from "../core/target.js";

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

/** Compares an item's installed files with what this CLI would install. */
async function diffItem(
  root: string,
  manifest: Manifest | undefined,
  rendered: readonly RenderedFile[],
  version: string,
  files: ShowFile[],
): Promise<void> {
  for (const file of files) {
    const entry = rendered.find((f) => f.destination === file.destination)!;
    // The AGENTS.md block also carries the project context reference when one is configured.
    const bundled =
      entry.install === "managed-block" && entry.destination === AGENTS_MD
        ? composeAgentsBody([entry.content], manifest?.contextPath)
        : entry.content;
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
      to: `${where} (bundled ${version})`,
    });
    file.local =
      local.state === "missing" ? "missing" : file.diff === "" ? "identical" : "different";
  }
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
    ...d.files.map((f) => `  ${f.destination}\n    source: ${f.packagedPath}`),
  ].join("\n");
}

/** Prints an item's bundled files, or how the target differs from them, for manual comparison. */
export async function show(
  id: string,
  options: Where & { json: boolean; file?: string; diff: boolean },
): Promise<number> {
  const done = (diagnostics: Diagnostic[], target: string | null, data?: ShowData) =>
    emit(
      { command: "show", target, diagnostics, ...(data ? { data } : {}) },
      options.json,
      (d) => render(d, options),
      { raw: options.file !== undefined && !options.diff },
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
  // Diffs cover the agents installed in the target; listings show every agent's files.
  let agents: readonly AgentId[] = AGENT_IDS;
  let manifest: Manifest | undefined;
  let target: string | null = null;
  const scope = scopeOf(options);
  if (options.diff) {
    const resolved = await resolveWhere(options);
    if (!resolved.root) return done(resolved.diagnostics, null);
    const read = await readManifest(resolved.root);
    if (read.diagnostics.length > 0) return done(read.diagnostics, resolved.root);
    manifest = read.manifest;
    agents = agentsFor(manifest);
    const scopeDiagnostics = checkScope(manifest, scope, agents);
    if (scopeDiagnostics.length > 0) return done(scopeDiagnostics, resolved.root);
    target = resolved.root;
  }
  const rendered = renderItem(item, contents, agents, scope);
  const selected =
    options.file === undefined ? rendered : rendered.filter((f) => f.destination === options.file);
  if (selected.length === 0) {
    return done(
      [
        error("UNKNOWN_ITEM", `${id} has no file with destination ${options.file}`, {
          action: `Use one of: ${rendered.map((f) => f.destination).join(", ")}`,
        }),
      ],
      target,
    );
  }
  const files: ShowFile[] = selected.map((f) => ({
    destination: f.destination,
    packagedPath: path.join(root, ...f.source.split("/")),
    sha256: contentHash(f.content),
    ...((options.file !== undefined || options.json) && !options.diff
      ? { content: f.content }
      : {}),
  }));
  const data: ShowData = {
    id: item.id,
    version: item.version,
    description: item.description,
    files,
  };
  if (!options.diff || target === null) return done([], target, data);
  await diffItem(target, manifest, rendered, item.version, files);
  return done([], target, data);
}
