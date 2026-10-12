import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START } from "../src/core/blocks.js";
import { contentHash } from "../src/core/content.js";
import {
  CONTEXT_PATH,
  planInstall,
  resolveSelection,
  type InstallRequest,
  type Plan,
} from "../src/core/planner.js";
import {
  buildRegistry,
  loadPackagedRegistry,
  type PackagedRegistry,
} from "../src/core/registry.js";
import type { Manifest } from "../src/core/schemas.js";
import { rawHash, type FileState } from "../src/core/target.js";
import { fullRegistryFiles, GUIDELINE_MD, SKILL_MD, tempDir, writeTree } from "./helpers.js";

let registry: PackagedRegistry;

beforeAll(async () => {
  const out = path.join(await tempDir(), "registry");
  await buildRegistry(await writeTree(fullRegistryFiles()), out);
  registry = (await loadPackagedRegistry(out)).value!;
});

const SKILL_DEST = ".claude/skills/kit-review/SKILL.md";
const file = (text: string): FileState => ({ state: "file", text, rawHash: rawHash(text) });
const block = (body: string) => `${BLOCK_START}\n\n${body}\n\n${BLOCK_END}\n`;

function request(ids: string[] = ["preset/base"], context = false): InstallRequest {
  return { ...resolveSelection(registry, ids).request!, context };
}

function plan(
  files: Record<string, FileState> = {},
  manifest?: Manifest,
  req: InstallRequest = request(),
): Plan {
  return planInstall({
    registry,
    manifest,
    files: new Map(Object.entries(files)),
    request: req,
    cliVersion: "9.9.9",
    contextTemplate: "# Context\n",
  });
}

const actions = (p: Plan) => Object.fromEntries(p.changes.map((c) => [c.destination, c.action]));

describe("resolveSelection", () => {
  it("expands presets and deduplicates items", () => {
    const { request } = resolveSelection(registry, ["preset/base", "skill/review"]);
    expect(request?.items.map((i) => i.id)).toEqual(["guideline/engineering", "skill/review"]);
    expect(request?.presets).toEqual(["preset/base"]);
  });

  it("rejects unknown ids", () => {
    expect(resolveSelection(registry, ["skill/nope"]).diagnostics[0]?.code).toBe("UNKNOWN_ITEM");
  });
});

describe("planInstall in an empty project", () => {
  const p = () => plan();

  it("creates item files, the AGENTS.md block, and the CLAUDE.md bridge", () => {
    expect(actions(p())).toEqual({
      [SKILL_DEST]: "create",
      "AGENTS.md": "create",
      "CLAUDE.md": "create",
    });
    const writes = Object.fromEntries(p().writes.map((w) => [w.destination, w]));
    expect(writes[SKILL_DEST]).toEqual({
      destination: SKILL_DEST,
      content: SKILL_MD,
      expected: "missing",
    });
    expect(writes["AGENTS.md"]?.content).toBe(block(GUIDELINE_MD.trimEnd()));
    expect(writes["CLAUDE.md"]?.content).toBe(block("@AGENTS.md"));
  });

  it("records items, blocks, presets, and import ownership in the manifest", () => {
    const m = p().manifest!;
    expect(Object.keys(m.items)).toEqual(["guideline/engineering", "skill/review"]);
    expect(m.blocks["AGENTS.md"]).toEqual({ sha256: contentHash(GUIDELINE_MD), createdFile: true });
    expect(m.claudeImport).toBe("managed");
    expect(m.presets).toEqual(["preset/base"]);
    expect(m.cliVersion).toBe("9.9.9");
    expect(p().manifestChanged).toBe(true);
  });
});

describe("planInstall with existing content", () => {
  it("preserves an existing @AGENTS.md import as user-owned", () => {
    const p = plan({ "CLAUDE.md": file("# Project\n\nSee @AGENTS.md for rules.\n") });
    expect(actions(p)["CLAUDE.md"]).toBe("unchanged");
    expect(p.manifest!.claudeImport).toBe("user-owned");
    expect(p.writes.some((w) => w.destination === "CLAUDE.md")).toBe(false);
  });

  it("appends a block to an existing AGENTS.md and guards the write with its hash", () => {
    const text = "# Team rules\n";
    const p = plan({ "AGENTS.md": file(text) });
    const write = p.writes.find((w) => w.destination === "AGENTS.md")!;
    expect(write.content!.startsWith(text)).toBe(true);
    expect(write.expected).toBe(rawHash(text));
    expect(p.manifest!.blocks["AGENTS.md"]?.createdFile).toBe(false);
  });

  it("adopts an existing file that already matches", () => {
    const p = plan({ [SKILL_DEST]: file(SKILL_MD.replace(/\n/g, "\r\n")) });
    expect(actions(p)[SKILL_DEST]).toBe("adopt");
    expect(p.writes.some((w) => w.destination === SKILL_DEST)).toBe(false);
  });

  it("refuses to overwrite a different unmanaged file", () => {
    const p = plan({ [SKILL_DEST]: file("mine") });
    expect(actions(p)[SKILL_DEST]).toBe("conflict");
    expect(p.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["UNMANAGED_FILE_CONFLICT", "conflict"],
    ]);
  });

  it("reports unsafe destinations and malformed markers as conflicts", () => {
    const p = plan({
      [SKILL_DEST]: { state: "unsafe", reason: "destination is a symlink" },
      "AGENTS.md": file(`${BLOCK_START}\nunterminated\n`),
    });
    expect(p.diagnostics.map((d) => d.code).sort()).toEqual(["MALFORMED_BLOCK", "UNSAFE_PATH"]);
  });

  it("adopts a matching unrecorded block left by an interrupted run", () => {
    const p = plan({ "AGENTS.md": file(block(GUIDELINE_MD.trimEnd())) });
    expect(actions(p)["AGENTS.md"]).toBe("adopt");
  });

  it("does not take over a foreign block with different content", () => {
    const p = plan({ "AGENTS.md": file(block("someone else's")) });
    expect(p.diagnostics.map((d) => d.code)).toEqual(["LOCAL_EDIT_CONFLICT"]);
  });
});

describe("planInstall on an existing installation", () => {
  const installed = () => {
    const first = plan();
    const files: Record<string, FileState> = {};
    for (const w of first.writes) files[w.destination] = file(w.content!);
    return { manifest: first.manifest!, files };
  };

  it("is a no-op when repeated with the same inputs", () => {
    const { manifest, files } = installed();
    const again = plan(files, manifest);
    expect(again.writes).toEqual([]);
    expect(again.manifestChanged).toBe(false);
    expect(new Set(again.changes.map((c) => c.action))).toEqual(new Set(["unchanged"]));
  });

  it("adds context by rewriting an unedited AGENTS.md block", () => {
    const { manifest, files } = installed();
    const p = plan(files, manifest, request(["preset/base"], true));
    expect(actions(p)).toMatchObject({ [CONTEXT_PATH]: "create", "AGENTS.md": "update" });
    expect(p.writes.find((w) => w.destination === "AGENTS.md")?.content).toContain(CONTEXT_PATH);
    expect(p.manifest!.contextPath).toBe(CONTEXT_PATH);
  });

  it("references an existing context file without replacing it", () => {
    const { manifest, files } = installed();
    files[CONTEXT_PATH] = file("# Ours\n");
    const p = plan(files, manifest, request(["preset/base"], true));
    expect(actions(p)[CONTEXT_PATH]).toBe("unchanged");
    expect(p.writes.some((w) => w.destination === CONTEXT_PATH)).toBe(false);
  });

  it("refuses to rewrite a locally edited block", () => {
    const { manifest, files } = installed();
    files["AGENTS.md"] = file(block("edited by hand"));
    const p = plan(files, manifest, request(["preset/base"], true));
    expect(p.diagnostics.map((d) => d.code)).toEqual(["LOCAL_EDIT_CONFLICT"]);
  });

  it("warns when an installed item has a newer version available", () => {
    const { manifest, files } = installed();
    manifest.items["skill/review"]!.version = "0.9.0";
    const p = plan(files, manifest);
    expect(p.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["UPDATE_AVAILABLE", "warning"],
    ]);
    expect(p.writes).toEqual([]);
  });

  it("asks for an update before changing a block built from an outdated item", () => {
    const { manifest, files } = installed();
    manifest.items["guideline/engineering"]!.version = "0.9.0";
    const p = plan(files, manifest, request(["preset/base"], true));
    expect(p.diagnostics.map((d) => d.code)).toContain("OUTDATED_ITEM");
  });
});
