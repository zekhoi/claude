import { parseBlock, removeBlock, unwrapBlock, writeBlock } from "./blocks.js";
import { contentHash } from "./content.js";
import { conflict, type Diagnostic, type DiagnosticCode } from "./diagnostics.js";
import { emptyManifest } from "./manifest.js";
import type { Manifest, PlannedChange } from "./schemas.js";
import type { FileState } from "./target.js";

/** A file mutation the writer must perform, guarded by the state observed while planning. */
export interface WriteOp {
  destination: string;
  /** New content, or `null` to delete the file. */
  content: string | null;
  /** `missing`, or the raw hash of the file content the plan was computed from. */
  expected: "missing" | string;
}

export interface Plan {
  changes: PlannedChange[];
  writes: WriteOp[];
  /** Next manifest, or `null` when the manifest should be deleted (uninstall). */
  manifest: Manifest | null;
  manifestChanged: boolean;
  /** Directories to remove after a successful apply, if they are empty. */
  pruneDirs: string[];
  diagnostics: Diagnostic[];
  /**
   * True when conflicts only skipped whole items and the rest of the plan may be applied
   * (no-argument `update`). Otherwise any conflict cancels the command.
   */
  partial: boolean;
}

type ChangeBase = Omit<PlannedChange, "action" | "code" | "reason">;

interface Checkpoint {
  changes: number;
  writes: number;
  diagnostics: number;
  prune: string[];
  next: Manifest;
}

/** Accumulates a plan against a read-only snapshot of the target. Performs no I/O. */
export class PlanBuilder {
  readonly changes: PlannedChange[] = [];
  readonly writes: WriteOp[] = [];
  readonly diagnostics: Diagnostic[] = [];
  next: Manifest;
  private prune = new Set<string>();

  constructor(
    readonly manifest: Manifest | undefined,
    private readonly files: ReadonlyMap<string, FileState>,
    private readonly cliVersion: string,
  ) {
    this.next = structuredClone(manifest ?? emptyManifest(cliVersion));
  }

  stateOf(destination: string): FileState {
    return this.files.get(destination) ?? { state: "missing" };
  }

  change(change: PlannedChange): void {
    this.changes.push(change);
  }

  reject(base: ChangeBase, code: DiagnosticCode, message: string, action: string): void {
    this.changes.push({ ...base, action: "conflict", code, reason: message });
    this.diagnostics.push(conflict(code, message, { path: base.destination, action }));
  }

  conflictCount(): number {
    return this.diagnostics.filter((d) => d.severity === "conflict").length;
  }

  private expectedFor(destination: string): "missing" | string {
    const state = this.stateOf(destination);
    return state.state === "file" ? state.rawHash : "missing";
  }

  write(destination: string, content: string, change: PlannedChange): void {
    if (this.writes.some((w) => w.destination === destination)) {
      throw new Error(`internal: ${destination} planned twice`);
    }
    const state = this.stateOf(destination);
    if (state.state === "missing" && state.missingDirs) {
      this.next.createdDirs = [...new Set([...this.next.createdDirs, ...state.missingDirs])].sort();
    }
    this.writes.push({ destination, content, expected: this.expectedFor(destination) });
    this.changes.push(change);
  }

  delete(destination: string, change: PlannedChange): void {
    this.writes.push({ destination, content: null, expected: this.expectedFor(destination) });
    this.changes.push(change);
  }

  pruneIfEmpty(dir: string): void {
    this.prune.add(dir);
  }

  checkpoint(): Checkpoint {
    return {
      changes: this.changes.length,
      writes: this.writes.length,
      diagnostics: this.diagnostics.length,
      prune: [...this.prune],
      next: structuredClone(this.next),
    };
  }

  /** Discards everything planned since `mark`, returning the conflicts it produced. */
  rollback(mark: Checkpoint): { changes: PlannedChange[]; diagnostics: Diagnostic[] } {
    const changes = this.changes.splice(mark.changes).filter((c) => c.action === "conflict");
    const diagnostics = this.diagnostics
      .splice(mark.diagnostics)
      .filter((d) => d.severity === "conflict");
    this.writes.splice(mark.writes);
    this.prune = new Set(mark.prune);
    this.next = mark.next;
    return { changes, diagnostics };
  }

  /**
   * Sets the managed block in `destination` to `body`, or removes it when `body` is undefined.
   * Refuses to touch blocks edited since they were last written.
   */
  block(destination: string, body: string | undefined, itemId?: string): void {
    const base: ChangeBase = { destination, kind: "managed-block", ...(itemId ? { itemId } : {}) };
    const record = this.manifest?.blocks[destination];
    const state = this.stateOf(destination);

    if (state.state === "unsafe") {
      this.reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
      return;
    }
    if (state.state === "missing") {
      if (body === undefined) {
        delete this.next.blocks[destination];
        this.change({ ...base, action: "unchanged", reason: "file already removed" });
        return;
      }
      this.write(destination, writeBlock(undefined, body), { ...base, action: "create" });
      this.next.blocks[destination] = {
        sha256: contentHash(body),
        createdFile: record?.createdFile ?? true,
      };
      return;
    }

    const parsed = parseBlock(state.text);
    if (parsed.kind === "malformed") {
      this.reject(
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
      if (body === undefined) {
        delete this.next.blocks[destination];
        this.change({ ...base, action: "unchanged", reason: "block already removed" });
        return;
      }
      this.write(destination, writeBlock(state.text, body), {
        ...base,
        action: "update",
        reason: "add managed block",
      });
      this.next.blocks[destination] = { sha256: contentHash(body), createdFile };
      return;
    }

    const current = contentHash(parsed.body);
    const pristine = record !== undefined && current === record.sha256;
    if (body === undefined) {
      if (!pristine) {
        this.reject(
          base,
          "LOCAL_EDIT_CONFLICT",
          "the managed block was edited locally",
          "Compare with `agent-kit show guideline/engineering --diff`, then move your edits outside the agent-kit markers or revert them, and rerun",
        );
        return;
      }
      const remaining = removeBlock(state.text);
      delete this.next.blocks[destination];
      if (remaining.trim() === "" && createdFile) {
        this.delete(destination, { ...base, action: "delete", reason: "created by agent-kit" });
      } else {
        this.write(destination, remaining, {
          ...base,
          action: "update",
          reason: "remove managed block",
        });
      }
      return;
    }

    const desired = contentHash(body);
    if (current === desired) {
      this.change({ ...base, action: record?.sha256 === desired ? "unchanged" : "adopt" });
    } else if (pristine) {
      this.write(destination, writeBlock(state.text, body), { ...base, action: "update" });
    } else {
      this.reject(
        base,
        "LOCAL_EDIT_CONFLICT",
        "the managed block was edited locally",
        "Compare with `agent-kit show guideline/engineering --diff`, then move your edits outside the agent-kit markers or revert them, and rerun",
      );
      return;
    }
    this.next.blocks[destination] = { sha256: desired, createdFile };
  }

  /** Removes the markers around a block, keeping its text as user-owned content. */
  unwrap(destination: string, itemId?: string): void {
    const base: ChangeBase = { destination, kind: "managed-block", ...(itemId ? { itemId } : {}) };
    const state = this.stateOf(destination);
    delete this.next.blocks[destination];
    if (state.state === "unsafe") {
      this.reject(base, "UNSAFE_PATH", state.reason, "Move or remove the path, then rerun");
      return;
    }
    if (state.state === "missing") return;
    const parsed = parseBlock(state.text);
    if (parsed.kind === "malformed") {
      this.reject(
        base,
        "MALFORMED_BLOCK",
        `agent-kit markers are malformed: ${parsed.reason}`,
        "Repair or remove the <!-- agent-kit:start --> / <!-- agent-kit:end --> markers, then rerun",
      );
      return;
    }
    if (parsed.kind === "none") return;
    this.write(destination, unwrapBlock(state.text), {
      ...base,
      action: "release",
      reason: "markers removed; content kept as your own",
    });
  }

  finish(options: { deleteManifest?: boolean; partial?: boolean } = {}): Plan {
    const comparable = (m: Manifest | undefined) => m && JSON.stringify({ ...m, cliVersion: "" });
    const manifest = options.deleteManifest ? null : this.next;
    const manifestChanged = options.deleteManifest
      ? this.manifest !== undefined
      : comparable(this.next) !== comparable(this.manifest);
    if (manifest && manifestChanged) manifest.cliVersion = this.cliVersion;
    return {
      changes: this.changes,
      writes: this.writes,
      manifest,
      manifestChanged,
      pruneDirs: [...this.prune].sort((a, b) => b.length - a.length),
      diagnostics: this.diagnostics,
      partial: options.partial ?? false,
    };
  }
}
