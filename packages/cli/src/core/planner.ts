import {
  AGENTS_IMPORT,
  AGENTS_MD,
  CLAUDE_MD,
  hasAgentsImport,
  ownedDirs,
} from "../adapters/claude.js";
import {
  AGENT_IDS,
  renderItem,
  type AgentId,
  type RenderedFile,
  type Scope,
} from "../adapters/index.js";
import { parseBlock } from "./blocks.js";
import { contentHash, normalizeContent } from "./content.js";
import { error, warning, type Diagnostic } from "./diagnostics.js";
import { MANIFEST_PATH } from "./manifest.js";
import { PlanBuilder, type Plan } from "./plan-builder.js";
import type { PackagedRegistry } from "./registry.js";
import type { Manifest, PackagedItem } from "./schemas.js";
import type { FileState } from "./target.js";

export type { Plan, WriteOp } from "./plan-builder.js";

/** Project-owned context file created from the bundled template by `init --context`. */
export const CONTEXT_PATH = "docs/agent-context.md";

export interface InstallRequest {
  items: PackagedItem[];
  presets: string[];
  context: boolean;
  /** Agents to install for, in addition to those already recorded in the manifest. */
  agents: AgentId[];
  /** Installation scope; an existing manifest's scope always wins. */
  scope?: Scope;
}

interface PlanContext {
  registry: PackagedRegistry;
  manifest: Manifest | undefined;
  files: ReadonlyMap<string, FileState>;
  cliVersion: string;
}

export interface PlanInput extends PlanContext {
  request: InstallRequest;
  contextTemplate: string;
}

type ManifestItem = Manifest["items"][string];

const NOT_INSTALLED_ACTION = "Run `agent-kit status` to see installed items";

/** Expands item and preset ids into items, deduplicated in first-seen order. */
export function resolveSelection(
  registry: PackagedRegistry,
  ids: readonly string[],
): {
  request?: Omit<InstallRequest, "context" | "agents" | "scope">;
  diagnostics: Diagnostic[];
} {
  const byId = new Map(registry.index.items.map((i) => [i.id, i]));
  const presetsById = new Map(registry.index.presets.map((p) => [p.id, p]));
  const items = new Map<string, PackagedItem>();
  const presets: string[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const id of ids) {
    const preset = presetsById.get(id);
    const memberIds = preset ? preset.items : [id];
    if (preset) presets.push(preset.id);
    for (const memberId of memberIds) {
      const item = byId.get(memberId);
      if (item) items.set(item.id, item);
      else {
        diagnostics.push(
          error("UNKNOWN_ITEM", `${id} is not in the catalog bundled with this CLI`, {
            action: "Run `agent-kit list` to see available items and presets",
          }),
        );
      }
    }
  }
  return diagnostics.length > 0
    ? { diagnostics }
    : { request: { items: [...items.values()], presets }, diagnostics };
}

/** Agents recorded in the manifest plus `extra`, in a stable order. */
export function agentsFor(
  manifest: Manifest | undefined,
  extra: readonly AgentId[] = [],
): AgentId[] {
  const selected = new Set<AgentId>([...(manifest?.agents ?? []), ...extra]);
  if (selected.size === 0) selected.add("claude");
  return AGENT_IDS.filter((a) => selected.has(a));
}

/** Every target path that planning against `manifest` and these items may read or write. */
export function requiredPaths(
  registry: PackagedRegistry,
  manifest: Manifest | undefined,
  items: readonly PackagedItem[] = [],
  options: { context?: boolean; agents?: readonly AgentId[]; scope?: Scope } = {},
): string[] {
  const agents = agentsFor(manifest, options.agents);
  const scope = manifest?.scope ?? options.scope ?? "project";
  const context = options.context ?? false;
  const paths = scope === "project" ? [AGENTS_MD, CLAUDE_MD] : [];
  paths.push(...Object.keys(manifest?.blocks ?? {}));
  const rendered = (item: PackagedItem) =>
    renderItem(item, registry.contents, agents, scope).map((f) => f.destination);
  for (const [id, entry] of Object.entries(manifest?.items ?? {})) {
    paths.push(...entry.files.map((f) => f.destination));
    // Installed items may gain files for newly selected agents.
    const item = registry.index.items.find((i) => i.id === id);
    if (item) paths.push(...rendered(item));
  }
  for (const item of items) paths.push(...rendered(item));
  if (scope === "project" && (context || manifest?.contextPath)) {
    paths.push(manifest?.contextPath ?? CONTEXT_PATH);
  }
  return [...new Set(paths)];
}

/** Body of the AGENTS.md managed block: guideline parts followed by the context reference. */
export function composeAgentsBody(parts: readonly string[], contextPath?: string): string {
  const sections = parts.map(normalizeContent);
  if (contextPath) {
    sections.push(
      `## Project context\n\nRead \`${contextPath}\` for this project's purpose, layout, commands, and conventions before making changes.`,
    );
  }
  return sections.join("\n\n");
}

type FileList = { files: readonly { destination: string; install: string }[] };

/** Managed-block destinations an installed item contributes to. */
function blockDestinations(entry: FileList): string[] {
  return entry.files.filter((f) => f.install === "managed-block").map((f) => f.destination);
}

/**
 * Recomputes every guidelines block from the items in the next manifest: the shared AGENTS.md
 * block in a project, or one block per agent at user scope. Blocks no item contributes to any
 * more are removed. `fresh` supplies content for items changed by this plan; other items must
 * match the bundled registry version.
 */
function syncBlocks(
  b: PlanBuilder,
  registry: PackagedRegistry,
  fresh: ReadonlyMap<string, string>,
  itemId?: string,
): void {
  const project = b.next.scope === "project";
  const destinations = new Set<string>();
  for (const entry of Object.values(b.next.items)) {
    for (const d of blockDestinations(entry)) destinations.add(d);
  }
  // Blocks recorded before this plan (except the CLAUDE.md import) may need removing.
  for (const d of Object.keys(b.manifest?.blocks ?? {})) {
    if (!(project && d === CLAUDE_MD)) destinations.add(d);
  }
  if (project && b.next.contextPath) destinations.add(AGENTS_MD);

  for (const destination of [...destinations].sort()) {
    const parts: string[] = [];
    let outdated: string | undefined;
    for (const [id, entry] of Object.entries(b.next.items).sort(([x], [y]) => x.localeCompare(y))) {
      if (!blockDestinations(entry).includes(destination)) continue;
      const content = fresh.get(id) ?? bundledBlockContent(registry, id, entry.version);
      if (content === undefined) outdated = id;
      else parts.push(content);
    }
    if (outdated) {
      b.reject(
        { destination, kind: "managed-block", itemId: outdated },
        "OUTDATED_ITEM",
        `${outdated} must be updated before the ${destination} block can change`,
        `Run \`agent-kit update ${outdated}\`, then rerun`,
      );
      continue;
    }
    const contextPath = project && destination === AGENTS_MD ? b.next.contextPath : undefined;
    const empty = parts.length === 0 && !contextPath;
    b.block(destination, empty ? undefined : composeAgentsBody(parts, contextPath), itemId);
  }
  if (project) syncBridge(b);
}

function bundledBlockContent(
  registry: PackagedRegistry,
  id: string,
  version: string,
): string | undefined {
  const item = registry.index.items.find((i) => i.id === id);
  const file = item?.files.find((f) => f.install === "managed-block");
  return item?.version === version && file ? registry.contents.get(file.source) : undefined;
}

/**
 * Keeps the CLAUDE.md → AGENTS.md import in step with whether the AGENTS.md block exists.
 * Only Claude Code needs the import; other agents read AGENTS.md natively.
 */
function syncBridge(b: PlanBuilder): void {
  const hasAgentsBlock = b.next.blocks[AGENTS_MD] !== undefined && b.next.agents.includes("claude");
  if (hasAgentsBlock && b.next.claudeImport === undefined) {
    const state = b.stateOf(CLAUDE_MD);
    const parsed = state.state === "file" ? parseBlock(state.text) : undefined;
    const outside =
      state.state !== "file"
        ? ""
        : parsed?.kind === "block"
          ? parsed.before + parsed.after
          : state.text;
    if (hasAgentsImport(outside)) {
      b.next.claudeImport = "user-owned";
      b.change({
        action: "unchanged",
        destination: CLAUDE_MD,
        kind: "managed-block",
        reason: "existing @AGENTS.md import is user-owned",
      });
    } else {
      b.next.claudeImport = "managed";
      b.block(CLAUDE_MD, AGENTS_IMPORT);
    }
  } else if (!hasAgentsBlock && b.next.claudeImport !== undefined) {
    if (b.next.claudeImport === "managed") b.block(CLAUDE_MD, undefined);
    if (b.next.blocks[CLAUDE_MD] === undefined) delete b.next.claudeImport;
  }
}

function manifestEntry(item: PackagedItem, files: readonly RenderedFile[]): ManifestItem {
  return {
    version: item.version,
    files: files.map(({ destination, install, content }) => ({
      destination,
      install,
      sha256: contentHash(content),
    })),
  };
}

/** Adds the files an installed item needs for newly selected agents. */
function addAgentFiles(
  b: PlanBuilder,
  registry: PackagedRegistry,
  id: string,
  agents: readonly AgentId[],
): boolean {
  const entry = b.next.items[id]!;
  const item = registry.index.items.find((i) => i.id === id);
  if (!item) {
    b.diagnostics.push(
      warning(
        "ITEM_RETIRED",
        `${id} is no longer in the catalog, so it is not added for ${agents.join(", ")}`,
        {
          action: `Keep it with \`agent-kit eject ${id}\` or delete it with \`agent-kit remove ${id}\``,
        },
      ),
    );
    return false;
  }
  const scope = b.next.scope;
  const recorded = new Set(entry.files.map((f) => f.destination));
  // A shared project AGENTS.md block is already recorded; user-scope blocks are per agent.
  const missing = renderItem(item, registry.contents, agents, scope).filter(
    (f) => !recorded.has(f.destination),
  );
  if (missing.length === 0) return false;
  // The bundled version is the only one that can be rendered; older versions must update first.
  if (item.version !== entry.version) {
    b.reject(
      { destination: id, kind: "file", itemId: id },
      "OUTDATED_ITEM",
      `${id} ${entry.version} must be updated to the bundled version before adding agents`,
      `Run \`agent-kit update ${id}\`, then rerun`,
    );
    return false;
  }
  for (const file of missing) {
    if (file.install !== "managed-block") placeNewFile(b, item, file.destination, file.content);
    entry.files.push({
      destination: file.destination,
      install: file.install,
      sha256: contentHash(file.content),
    });
  }
  // Keep recorded files in rendering order so later comparisons are stable.
  const order = renderItem(item, registry.contents, AGENT_IDS, scope).map((f) => f.destination);
  const rank = (destination: string) => {
    const index = order.indexOf(destination);
    return index === -1 ? order.length : index;
  };
  entry.files.sort((x, y) => rank(x.destination) - rank(y.destination));
  return missing.some((f) => f.install === "managed-block");
}

/** Plans placing a registry file where no managed file was recorded. */
function placeNewFile(b: PlanBuilder, item: PackagedItem, destination: string, content: string) {
  const base = { destination, kind: "file" as const, itemId: item.id, toVersion: item.version };
  const state = b.stateOf(destination);
  if (state.state === "missing") b.write(destination, content, { ...base, action: "create" });
  else if (state.state === "unsafe") {
    b.reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
  } else if (normalizeContent(state.text) === normalizeContent(content)) {
    b.change({ ...base, action: "adopt", reason: "existing file matches" });
  } else {
    b.reject(
      base,
      "UNMANAGED_FILE_CONFLICT",
      "an existing file not managed by agent-kit occupies this destination",
      `Rename or move the existing file, or replace it with \`agent-kit show ${item.id} --file ${destination}\`, then rerun`,
    );
  }
}

/** Plans an `init` or `add`. */
export function planInstall(input: PlanInput): Plan {
  const { registry, manifest, request } = input;
  const b = new PlanBuilder(manifest, input.files, input.cliVersion);
  const fresh = new Map<string, string>();
  const agents = agentsFor(manifest, request.agents);
  const addedAgents = agents.filter((a) => !(manifest?.agents ?? []).includes(a));
  b.next.agents = agents;
  b.next.scope = manifest?.scope ?? request.scope ?? "project";

  for (const item of request.items) {
    const installed = manifest?.items[item.id];
    if (installed) {
      if (installed.version !== item.version) {
        b.diagnostics.push(
          warning(
            "UPDATE_AVAILABLE",
            `${item.id} is installed at ${installed.version}; ${item.version} is available`,
            { action: `Run \`agent-kit update ${item.id}\`` },
          ),
        );
      }
      for (const f of installed.files) {
        b.change({
          action: "unchanged",
          destination: f.destination,
          kind: f.install,
          itemId: item.id,
          fromVersion: installed.version,
          reason: "already installed",
        });
      }
      continue;
    }
    const files = renderItem(item, registry.contents, agents, b.next.scope);
    for (const file of files) {
      if (file.install === "managed-block") fresh.set(item.id, file.content);
      else placeNewFile(b, item, file.destination, file.content);
    }
    b.next.items[item.id] = manifestEntry(item, files);
  }

  // Newly selected agents get files for everything already installed.
  let blocksAdded = false;
  if (manifest && addedAgents.length > 0) {
    for (const id of Object.keys(manifest.items).sort()) {
      blocksAdded = addAgentFiles(b, registry, id, addedAgents) || blocksAdded;
    }
  }

  let contextAdded = false;
  if (request.context && !b.next.contextPath && b.next.scope === "project") {
    const base = { destination: CONTEXT_PATH, kind: "context" as const };
    const state = b.stateOf(CONTEXT_PATH);
    if (state.state === "missing") {
      b.write(CONTEXT_PATH, input.contextTemplate, {
        ...base,
        action: "create",
        reason: "project-owned template to fill in",
      });
    } else if (state.state === "unsafe") {
      b.reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
    } else {
      b.change({ ...base, action: "unchanged", reason: "existing project context referenced" });
    }
    b.next.contextPath = CONTEXT_PATH;
    contextAdded = true;
  }

  if (fresh.size > 0 || contextAdded || blocksAdded) {
    syncBlocks(b, registry, fresh, fresh.keys().next().value);
  } else if (addedAgents.includes("claude") && b.next.scope === "project") {
    syncBridge(b);
  }
  b.next.presets = [...new Set([...b.next.presets, ...request.presets])].sort();
  return b.finish();
}

function major(version: string): number {
  return Number(version.split(".")[0]);
}

/** Plans one item's update. Conflicts are recorded on the builder. */
function planItemUpdate(
  b: PlanBuilder,
  registry: PackagedRegistry,
  installed: ManifestItem,
  item: PackagedItem,
  rendered: readonly RenderedFile[],
): void {
  const recorded = new Map(installed.files.map((f) => [f.destination, f]));
  const versions = { itemId: item.id, fromVersion: installed.version, toVersion: item.version };
  let blockContent: string | undefined;

  for (const file of rendered) {
    const content = file.content;
    const sha256 = contentHash(content);
    if (file.install === "managed-block") {
      blockContent = content;
      continue;
    }
    const old = recorded.get(file.destination);
    if (!old) {
      placeNewFile(b, item, file.destination, content);
      continue;
    }
    const base = { destination: file.destination, kind: "file" as const, ...versions };
    const state = b.stateOf(file.destination);
    if (state.state === "unsafe") {
      b.reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
    } else if (state.state === "missing") {
      b.reject(
        base,
        "MISSING_FILE",
        "a managed file was deleted locally",
        `Restore it with \`agent-kit show ${item.id} --file ${file.destination}\`, or run \`agent-kit remove ${item.id}\` or \`agent-kit eject ${item.id}\``,
      );
    } else {
      const current = contentHash(state.text);
      if (current === sha256) {
        b.change({ ...base, action: old.sha256 === sha256 ? "unchanged" : "adopt" });
      } else if (current === old.sha256) {
        b.write(file.destination, content, { ...base, action: "update" });
      } else {
        b.reject(
          base,
          "LOCAL_EDIT_CONFLICT",
          "the file was edited locally",
          `Compare with \`agent-kit show ${item.id} --diff\`; keep your version with \`agent-kit eject ${item.id}\`, or restore the bundled one with \`agent-kit show ${item.id} --file ${file.destination}\` and rerun`,
        );
      }
    }
  }

  // Files the new version no longer ships are deleted only if unmodified.
  const current = new Set(rendered.map((f) => f.destination));
  for (const old of installed.files) {
    if (old.install !== "file" || current.has(old.destination)) continue;
    deleteManagedFile(b, item.id, old, versions);
  }

  const hadBlock = blockDestinations(installed).length > 0;
  b.next.items[item.id] = manifestEntry(item, rendered);
  if (blockContent !== undefined || hadBlock) {
    syncBlocks(
      b,
      registry,
      blockContent === undefined ? new Map() : new Map([[item.id, blockContent]]),
      item.id,
    );
  }
}

function deleteManagedFile(
  b: PlanBuilder,
  itemId: string,
  file: ManifestItem["files"][number],
  extra: { fromVersion?: string; toVersion?: string } = {},
): void {
  const base = { destination: file.destination, kind: "file" as const, itemId, ...extra };
  const state = b.stateOf(file.destination);
  if (state.state === "missing") {
    b.change({ ...base, action: "unchanged", reason: "already deleted" });
  } else if (state.state === "unsafe") {
    b.reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
  } else if (contentHash(state.text) !== file.sha256) {
    b.reject(
      base,
      "LOCAL_EDIT_CONFLICT",
      "the file was edited locally and will not be deleted",
      `Compare with \`agent-kit show ${itemId} --diff\`; keep it with \`agent-kit eject ${itemId}\`, or revert your edits and rerun`,
    );
    return;
  } else {
    b.delete(file.destination, { ...base, action: "delete" });
  }
  for (const dir of ownedDirs(file.destination)) b.pruneIfEmpty(dir);
}

export interface UpdateInput extends PlanContext {
  /** Items to update; empty means every installed item, skipping items with conflicts. */
  ids: readonly string[];
  allowMajor: boolean;
}

/** Plans `update`. */
export function planUpdate(input: UpdateInput): Plan {
  const { registry, manifest } = input;
  const b = new PlanBuilder(manifest, input.files, input.cliVersion);
  const named = input.ids.length > 0;
  const ids = named ? [...new Set(input.ids)] : Object.keys(manifest?.items ?? {}).sort();
  const skipped: { changes: Plan["changes"]; diagnostics: Diagnostic[] } = {
    changes: [],
    diagnostics: [],
  };

  for (const id of ids) {
    const installed = manifest?.items[id];
    if (!installed) {
      b.diagnostics.push(
        error("NOT_INSTALLED", `${id} is not installed`, { action: NOT_INSTALLED_ACTION }),
      );
      continue;
    }
    const item = registry.index.items.find((i) => i.id === id);
    if (!item) {
      b.diagnostics.push(
        warning("ITEM_RETIRED", `${id} is no longer in the catalog bundled with this CLI`, {
          action: `Keep it with \`agent-kit eject ${id}\` or delete it with \`agent-kit remove ${id}\``,
        }),
      );
      continue;
    }
    const rendered = renderItem(item, registry.contents, agentsFor(manifest), manifest?.scope);
    const byDestination = (files: ManifestItem["files"]) =>
      JSON.stringify([...files].sort((x, y) => x.destination.localeCompare(y.destination)));
    const sameContent =
      installed.version === item.version &&
      byDestination(installed.files) === byDestination(manifestEntry(item, rendered).files);
    if (sameContent) continue;

    if (major(item.version) > major(installed.version) && !input.allowMajor) {
      const message = `${id} ${installed.version} → ${item.version} is a major update and may change its behavior or invocation`;
      const action = `Review the changelog, then run \`agent-kit update ${id} --allow-major\``;
      if (named) {
        b.reject({ destination: id, kind: "file", itemId: id }, "MAJOR_UPDATE", message, action);
      } else {
        b.diagnostics.push(warning("MAJOR_UPDATE", message, { action }));
      }
      continue;
    }

    const mark = b.checkpoint();
    const before = b.conflictCount();
    planItemUpdate(b, registry, installed, item, rendered);
    if (!named && b.conflictCount() > before) {
      const conflicts = b.rollback(mark);
      skipped.changes.push(...conflicts.changes);
      skipped.diagnostics.push(...conflicts.diagnostics);
    }
  }

  b.changes.push(...skipped.changes);
  b.diagnostics.push(...skipped.diagnostics);
  return b.finish({ partial: !named });
}

export interface SelectInput extends PlanContext {
  ids: readonly string[];
}

/** Plans `remove`: deletes unmodified managed files of the selected items. */
export function planRemove(input: SelectInput): Plan {
  const b = new PlanBuilder(input.manifest, input.files, input.cliVersion);
  let blockChanged = false;
  for (const id of new Set(input.ids)) {
    const installed = input.manifest?.items[id];
    if (!installed) {
      b.diagnostics.push(
        error("NOT_INSTALLED", `${id} is not installed`, { action: NOT_INSTALLED_ACTION }),
      );
      continue;
    }
    for (const f of installed.files) {
      if (f.install === "file") deleteManagedFile(b, id, f, { fromVersion: installed.version });
    }
    if (blockDestinations(installed).length > 0) blockChanged = true;
    delete b.next.items[id];
  }
  if (blockChanged) syncBlocks(b, input.registry, new Map());
  return b.finish();
}

/** Plans `eject`: forgets the selected items and leaves their content in place as user-owned. */
export function planEject(input: SelectInput): Plan {
  const b = new PlanBuilder(input.manifest, input.files, input.cliVersion);
  const unwrap = new Map<string, string>();
  for (const id of new Set(input.ids)) {
    const installed = input.manifest?.items[id];
    if (!installed) {
      b.diagnostics.push(
        error("NOT_INSTALLED", `${id} is not installed`, { action: NOT_INSTALLED_ACTION }),
      );
      continue;
    }
    for (const f of installed.files) {
      if (f.install !== "file") continue;
      b.change({
        action: "release",
        destination: f.destination,
        kind: "file",
        itemId: id,
        fromVersion: installed.version,
        reason: "kept as your own file",
      });
    }
    for (const destination of blockDestinations(installed)) unwrap.set(destination, id);
    delete b.next.items[id];
  }
  // Guidelines blocks are unwrapped, keeping their text (including the context reference).
  for (const [destination, id] of [...unwrap].sort(([x], [y]) => x.localeCompare(y))) {
    b.unwrap(destination, id);
  }
  if (unwrap.has(AGENTS_MD) && b.next.scope === "project") {
    delete b.next.contextPath;
    if (b.next.claudeImport === "managed") b.unwrap(CLAUDE_MD);
    delete b.next.claudeImport;
  }
  return b.finish();
}

/** Plans `uninstall`: removes every managed item and block, then the manifest. */
export function planUninstall(input: PlanContext): Plan {
  const b = new PlanBuilder(input.manifest, input.files, input.cliVersion);
  if (!input.manifest) return b.finish({ deleteManifest: true });
  for (const [id, installed] of Object.entries(input.manifest.items)) {
    for (const f of installed.files) {
      if (f.install === "file") deleteManagedFile(b, id, f, { fromVersion: installed.version });
    }
    delete b.next.items[id];
  }
  // The context file and any user-owned import are project-owned and stay.
  delete b.next.contextPath;
  delete b.next.claudeImport;
  for (const destination of Object.keys(input.manifest.blocks)) b.block(destination, undefined);
  for (const dir of input.manifest.createdDirs) b.pruneIfEmpty(dir);
  b.pruneIfEmpty(MANIFEST_PATH.split("/")[0]!);
  return b.finish({ deleteManifest: true });
}
