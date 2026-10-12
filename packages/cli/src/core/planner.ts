import { AGENTS_IMPORT, AGENTS_MD, CLAUDE_MD, hasAgentsImport } from "../adapters/claude.js";
import { parseBlock, writeBlock } from "./blocks.js";
import { contentHash, normalizeContent } from "./content.js";
import { conflict, error, warning, type Diagnostic, type DiagnosticCode } from "./diagnostics.js";
import { emptyManifest } from "./manifest.js";
import type { PackagedRegistry } from "./registry.js";
import type { Manifest, PackagedItem, PlannedChange } from "./schemas.js";
import type { FileState } from "./target.js";

/** Project-owned context file created from the bundled template by `init --context`. */
export const CONTEXT_PATH = "docs/agent-context.md";

export interface InstallRequest {
  items: PackagedItem[];
  presets: string[];
  context: boolean;
}

/** A file write the writer must perform, guarded by the state observed while planning. */
export interface WriteOp {
  destination: string;
  content: string;
  /** `missing`, or the raw hash of the file content the plan was computed from. */
  expected: "missing" | string;
}

export interface Plan {
  changes: PlannedChange[];
  writes: WriteOp[];
  manifest: Manifest;
  manifestChanged: boolean;
  diagnostics: Diagnostic[];
}

export interface PlanInput {
  registry: PackagedRegistry;
  manifest: Manifest | undefined;
  files: ReadonlyMap<string, FileState>;
  request: InstallRequest;
  cliVersion: string;
  contextTemplate: string;
}

/** Expands item and preset ids into items, deduplicated in first-seen order. */
export function resolveSelection(
  registry: PackagedRegistry,
  ids: readonly string[],
): { request?: Omit<InstallRequest, "context">; diagnostics: Diagnostic[] } {
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

/** Every target path an install of `request` may read or write. */
export function requiredPaths(request: InstallRequest): string[] {
  const paths = request.items.flatMap((i) => i.files.map((f) => f.destination));
  paths.push(AGENTS_MD, CLAUDE_MD);
  if (request.context) paths.push(CONTEXT_PATH);
  return paths;
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

/** Plans an `init` or `add`. Pure: reads only its inputs and performs no I/O. */
export function planInstall(input: PlanInput): Plan {
  const { registry, manifest, files, request, cliVersion } = input;
  const next: Manifest = structuredClone(manifest ?? emptyManifest(cliVersion));
  const changes: PlannedChange[] = [];
  const writes: WriteOp[] = [];
  const diagnostics: Diagnostic[] = [];
  const stateOf = (p: string): FileState => files.get(p) ?? { state: "missing" };

  const reject = (
    change: Omit<PlannedChange, "action" | "code" | "reason">,
    code: DiagnosticCode,
    message: string,
    action: string,
  ) => {
    changes.push({ ...change, action: "conflict", code, reason: message });
    diagnostics.push(conflict(code, message, { path: change.destination, action }));
  };

  // Managed-block content contributed by items installed in this command, keyed by destination.
  const newBlockParts = new Map<string, Map<string, string>>();

  for (const item of request.items) {
    const installed = manifest?.items[item.id];
    if (installed) {
      if (installed.version !== item.version) {
        diagnostics.push(
          warning(
            "UPDATE_AVAILABLE",
            `${item.id} is installed at ${installed.version}; ${item.version} is available`,
            { action: `Run \`agent-kit update ${item.id}\`` },
          ),
        );
      }
      for (const f of installed.files) {
        changes.push({
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

    for (const file of item.files) {
      const content = registry.contents.get(file.source)!;
      const base = {
        destination: file.destination,
        kind: file.install,
        itemId: item.id,
        toVersion: item.version,
      };
      if (file.install === "managed-block") {
        const parts = newBlockParts.get(file.destination) ?? new Map<string, string>();
        newBlockParts.set(file.destination, parts.set(item.id, content));
        continue;
      }
      const state = stateOf(file.destination);
      if (state.state === "missing") {
        writes.push({ destination: file.destination, content, expected: "missing" });
        changes.push({ ...base, action: "create" });
      } else if (state.state === "unsafe") {
        reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
      } else if (normalizeContent(state.text) === normalizeContent(content)) {
        changes.push({ ...base, action: "adopt", reason: "existing file matches" });
      } else {
        reject(
          base,
          "UNMANAGED_FILE_CONFLICT",
          "an existing file not managed by agent-kit occupies this destination",
          "Rename or move the existing file, or replace it with the bundled content (`agent-kit show`), then rerun",
        );
      }
    }
    next.items[item.id] = {
      version: item.version,
      files: item.files.map(({ destination, install, sha256 }) => ({
        destination,
        install,
        sha256,
      })),
    };
  }

  let contextAdded = false;
  if (request.context && !next.contextPath) {
    const base = { destination: CONTEXT_PATH, kind: "context" as const };
    const state = stateOf(CONTEXT_PATH);
    if (state.state === "missing") {
      writes.push({
        destination: CONTEXT_PATH,
        content: input.contextTemplate,
        expected: "missing",
      });
      changes.push({ ...base, action: "create", reason: "project-owned template to fill in" });
    } else if (state.state === "unsafe") {
      reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
    } else {
      changes.push({ ...base, action: "unchanged", reason: "existing project context referenced" });
    }
    next.contextPath = CONTEXT_PATH;
    contextAdded = true;
  }

  const planBlock = (destination: string, body: string, itemId?: string) => {
    const base = { destination, kind: "managed-block" as const, ...(itemId ? { itemId } : {}) };
    const record = manifest?.blocks[destination];
    const desired = contentHash(body);
    const state = stateOf(destination);
    const setRecord = (createdFile: boolean) => {
      next.blocks[destination] = { sha256: desired, createdFile };
    };

    if (state.state === "unsafe") {
      reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
      return;
    }
    if (state.state === "missing") {
      writes.push({ destination, content: writeBlock(undefined, body), expected: "missing" });
      changes.push({ ...base, action: "create" });
      setRecord(record?.createdFile ?? true);
      return;
    }
    const parsed = parseBlock(state.text);
    if (parsed.kind === "malformed") {
      reject(
        base,
        "MALFORMED_BLOCK",
        `agent-kit markers are malformed: ${parsed.reason}`,
        "Repair or remove the <!-- agent-kit:start --> / <!-- agent-kit:end --> markers, then rerun",
      );
      return;
    }
    // An unrecorded file holding nothing but a block was created by an interrupted run.
    const createdFile =
      record?.createdFile ??
      (parsed.kind === "block" && (parsed.before + parsed.after).trim() === "");
    if (parsed.kind === "none") {
      writes.push({ destination, content: writeBlock(state.text, body), expected: state.rawHash });
      changes.push({ ...base, action: "update", reason: "add managed block" });
      setRecord(createdFile);
      return;
    }
    const current = contentHash(parsed.body);
    if (current === desired) {
      changes.push({ ...base, action: record?.sha256 === desired ? "unchanged" : "adopt" });
      setRecord(createdFile);
    } else if (record && current === record.sha256) {
      writes.push({ destination, content: writeBlock(state.text, body), expected: state.rawHash });
      changes.push({ ...base, action: "update" });
      setRecord(createdFile);
    } else {
      reject(
        base,
        "LOCAL_EDIT_CONFLICT",
        "the managed block was edited locally",
        "Move your edits outside the agent-kit markers or revert them, then rerun",
      );
    }
  };

  const agentsParts = newBlockParts.get(AGENTS_MD);
  if (agentsParts || contextAdded) {
    const parts: string[] = [];
    let outdated: string | undefined;
    for (const [id, entry] of Object.entries(next.items).sort(([a], [b]) => a.localeCompare(b))) {
      if (!entry.files.some((f) => f.install === "managed-block" && f.destination === AGENTS_MD)) {
        continue;
      }
      const fresh = agentsParts?.get(id);
      const registryItem = registry.index.items.find((i) => i.id === id);
      const file = registryItem?.files.find((f) => f.destination === AGENTS_MD);
      if (fresh !== undefined) parts.push(fresh);
      else if (registryItem?.version === entry.version && file) {
        parts.push(registry.contents.get(file.source)!);
      } else outdated = id;
    }
    if (outdated) {
      reject(
        { destination: AGENTS_MD, kind: "managed-block", itemId: outdated },
        "OUTDATED_ITEM",
        `${outdated} must be updated before the AGENTS.md block can change`,
        `Run \`agent-kit update ${outdated}\`, then rerun`,
      );
    } else {
      planBlock(
        AGENTS_MD,
        composeAgentsBody(parts, next.contextPath),
        agentsParts?.keys().next().value,
      );
    }
  }

  if (next.blocks[AGENTS_MD] && next.claudeImport === undefined) {
    const state = stateOf(CLAUDE_MD);
    const parsed = state.state === "file" ? parseBlock(state.text) : undefined;
    const outside =
      state.state !== "file"
        ? ""
        : parsed?.kind === "block"
          ? parsed.before + parsed.after
          : state.text;
    if (hasAgentsImport(outside)) {
      next.claudeImport = "user-owned";
      changes.push({
        action: "unchanged",
        destination: CLAUDE_MD,
        kind: "managed-block",
        reason: "existing @AGENTS.md import is user-owned",
      });
    } else {
      next.claudeImport = "managed";
      planBlock(CLAUDE_MD, AGENTS_IMPORT);
    }
  }

  next.presets = [...new Set([...next.presets, ...request.presets])].sort();

  const comparable = (m: Manifest | undefined) =>
    m && JSON.stringify({ ...m, cliVersion: "" }, null, 0);
  const manifestChanged = comparable(next) !== comparable(manifest);
  if (manifestChanged) next.cliVersion = cliVersion;

  return { changes, writes, manifest: next, manifestChanged, diagnostics };
}
