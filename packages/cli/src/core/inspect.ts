import { AGENTS_IMPORT, CLAUDE_MD, hasAgentsImport } from "../adapters/claude.js";
import { parseBlock } from "./blocks.js";
import { contentHash } from "./content.js";
import type { PackagedRegistry } from "./registry.js";
import type { Manifest } from "./schemas.js";
import type { FileState } from "./target.js";

export type FileStatus = "ok" | "modified" | "missing" | "unsafe";
export type BlockStatus = FileStatus | "removed" | "malformed";

export interface ItemStatus {
  id: string;
  version: string;
  available?: string;
  update?: "minor" | "major";
  retired?: boolean;
  files: { destination: string; kind: "file" | "managed-block"; status: BlockStatus }[];
}

export interface InstallationStatus {
  cliVersion: string;
  presets: string[];
  items: ItemStatus[];
  blocks: { path: string; status: BlockStatus }[];
  claudeImport?: { ownership: "managed" | "user-owned"; present: boolean };
  context?: { path: string; present: boolean };
  /** Items in requested presets that are not installed; suggestions only. */
  suggestions: string[];
}

export function blockStatus(
  manifest: Manifest,
  path: string,
  files: ReadonlyMap<string, FileState>,
): BlockStatus {
  const state = files.get(path) ?? { state: "missing" };
  if (state.state !== "file") return state.state;
  const parsed = parseBlock(state.text);
  if (parsed.kind === "malformed") return "malformed";
  if (parsed.kind === "none") return "removed";
  return contentHash(parsed.body) === manifest.blocks[path]?.sha256 ? "ok" : "modified";
}

function fileStatus(state: FileState, sha256: string): FileStatus {
  if (state.state !== "file") return state.state;
  return contentHash(state.text) === sha256 ? "ok" : "modified";
}

/** Summarizes an installation from a snapshot of its files. Pure. */
export function inspectInstallation(
  manifest: Manifest,
  files: ReadonlyMap<string, FileState>,
  registry: PackagedRegistry,
): InstallationStatus {
  const blocks = Object.keys(manifest.blocks)
    .sort()
    .map((path) => ({ path, status: blockStatus(manifest, path, files) }));
  const blockByPath = new Map(blocks.map((b) => [b.path, b.status]));

  const items = Object.entries(manifest.items)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, entry]): ItemStatus => {
      const bundled = registry.index.items.find((i) => i.id === id);
      const status: ItemStatus = {
        id,
        version: entry.version,
        files: entry.files.map((f) => ({
          destination: f.destination,
          kind: f.install,
          status:
            f.install === "managed-block"
              ? (blockByPath.get(f.destination) ?? "missing")
              : fileStatus(files.get(f.destination) ?? { state: "missing" }, f.sha256),
        })),
      };
      if (!bundled) status.retired = true;
      else if (bundled.version !== entry.version) {
        status.available = bundled.version;
        status.update =
          bundled.version.split(".")[0] !== entry.version.split(".")[0] ? "major" : "minor";
      }
      return status;
    });

  const result: InstallationStatus = {
    cliVersion: manifest.cliVersion,
    presets: manifest.presets,
    items,
    blocks,
    suggestions: [
      ...new Set(
        registry.index.presets
          .filter((p) => manifest.presets.includes(p.id))
          .flatMap((p) => p.items)
          .filter((id) => !manifest.items[id]),
      ),
    ].sort(),
  };

  if (manifest.claudeImport) {
    const state = files.get(CLAUDE_MD);
    let present = false;
    if (state?.state === "file") {
      const parsed = parseBlock(state.text);
      present =
        manifest.claudeImport === "managed"
          ? parsed.kind === "block" && parsed.body.includes(AGENTS_IMPORT)
          : hasAgentsImport(parsed.kind === "block" ? parsed.before + parsed.after : state.text);
    }
    result.claudeImport = { ownership: manifest.claudeImport, present };
  }
  if (manifest.contextPath) {
    result.context = {
      path: manifest.contextPath,
      present: files.get(manifest.contextPath)?.state === "file",
    };
  }
  return result;
}
