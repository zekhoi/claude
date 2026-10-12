import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BLOCK_START } from "../src/core/blocks.js";
import type { Plan } from "../src/core/plan-builder.js";
import {
  CONTEXT_PATH,
  planEject,
  planInstall,
  planRemove,
  planUninstall,
  planUpdate,
  resolveSelection,
} from "../src/core/planner.js";
import {
  buildRegistry,
  loadPackagedRegistry,
  type PackagedRegistry,
} from "../src/core/registry.js";
import type { Manifest } from "../src/core/schemas.js";
import { rawHash, type FileState } from "../src/core/target.js";
import { guidelineItem, item, registryFiles, tempDir, writeTree } from "./helpers.js";

const SKILL = ".claude/skills/kit-review/SKILL.md";
const REF = ".claude/skills/kit-review/references/checks.md";
const skillMd = (body: string) => `---\nname: kit-review\ndescription: Review\n---\n\n${body}\n`;

async function registryVersion(
  guideline: { version: string; text: string },
  skill: { version: string; body: string; withReference: boolean },
): Promise<PackagedRegistry> {
  const files = [{ source: "skills/review/SKILL.md", destination: SKILL }];
  if (skill.withReference) files.push({ source: "skills/review/checks.md", destination: REF });
  const source = registryFiles(
    [guidelineItem({ version: guideline.version }), item({ version: skill.version, files })],
    {
      "guidelines/engineering.md": guideline.text,
      "skills/review/SKILL.md": skillMd(skill.body),
      "skills/review/checks.md": "- check things\n",
      "presets/base.json": {
        schemaVersion: 1,
        id: "preset/base",
        description: "Base",
        items: ["guideline/engineering", "skill/review"],
      },
    },
  );
  const out = path.join(await tempDir(), "registry");
  await buildRegistry(await writeTree(source), out);
  return (await loadPackagedRegistry(out)).value!;
}

let v1: PackagedRegistry;
let v1_1: PackagedRegistry;
let v2: PackagedRegistry;

beforeAll(async () => {
  v1 = await registryVersion(
    { version: "1.0.0", text: "## Guidelines\n\nv1\n" },
    { version: "1.0.0", body: "Steps v1.", withReference: false },
  );
  v1_1 = await registryVersion(
    { version: "1.1.0", text: "## Guidelines\n\nv1.1\n" },
    { version: "1.1.0", body: "Steps v1.1.", withReference: true },
  );
  v2 = await registryVersion(
    { version: "1.1.0", text: "## Guidelines\n\nv1.1\n" },
    { version: "2.0.0", body: "Steps v2.", withReference: false },
  );
});

const file = (text: string): FileState => ({ state: "file", text, rawHash: rawHash(text) });
const actions = (p: Plan) =>
  p.changes
    .filter((c) => c.reason !== "already installed")
    .map((c) => `${c.action} ${c.destination}`);
const codes = (p: Plan) => p.diagnostics.map((d) => d.code);

/** Applies a plan's writes to an in-memory file map. */
function apply(files: Record<string, FileState>, plan: Plan): Record<string, FileState> {
  const next = { ...files };
  for (const w of plan.writes) {
    if (w.content === null) delete next[w.destination];
    else next[w.destination] = file(w.content);
  }
  return next;
}

function installV1(initial: Record<string, FileState> = {}, context = false) {
  const plan = planInstall({
    registry: v1,
    manifest: undefined,
    files: new Map(Object.entries(initial)),
    request: { ...resolveSelection(v1, ["preset/base"]).request!, context },
    cliVersion: "1.0.0",
    contextTemplate: "# Context\n",
  });
  return { manifest: plan.manifest!, files: apply(initial, plan) };
}

const ctx = (manifest: Manifest | undefined, files: Record<string, FileState>, registry = v1) => ({
  registry,
  manifest,
  files: new Map(Object.entries(files)),
  cliVersion: "1.1.0",
});

describe("planUpdate", () => {
  it("updates unmodified files, adds new files, and rewrites the block", () => {
    const { manifest, files } = installV1();
    const p = planUpdate({ ...ctx(manifest, files, v1_1), ids: [], allowMajor: false });
    expect(actions(p)).toEqual([`update AGENTS.md`, `update ${SKILL}`, `create ${REF}`]);
    expect(p.manifest!.items["skill/review"]?.version).toBe("1.1.0");
    expect(p.manifest!.items["guideline/engineering"]?.version).toBe("1.1.0");
    expect(p.writes.find((w) => w.destination === "AGENTS.md")?.content).toContain("v1.1");
  });

  it("is a no-op when everything is current", () => {
    const { manifest, files } = installV1();
    const p = planUpdate({ ...ctx(manifest, files, v1), ids: [], allowMajor: false });
    expect(p.writes).toEqual([]);
    expect(p.manifestChanged).toBe(false);
  });

  it("skips an edited item without blocking other items", () => {
    const { manifest, files } = installV1();
    files[SKILL] = file("my edits\n");
    const p = planUpdate({ ...ctx(manifest, files, v1_1), ids: [], allowMajor: false });
    expect(p.partial).toBe(true);
    expect(codes(p)).toEqual(["LOCAL_EDIT_CONFLICT"]);
    expect(p.writes.map((w) => w.destination)).toEqual(["AGENTS.md"]);
    expect(p.manifest!.items["skill/review"]?.version).toBe("1.0.0");
    expect(p.manifest!.items["guideline/engineering"]?.version).toBe("1.1.0");
  });

  it("cancels a named update on conflict", () => {
    const { manifest, files } = installV1();
    files[SKILL] = file("my edits\n");
    const p = planUpdate({
      ...ctx(manifest, files, v1_1),
      ids: ["skill/review"],
      allowMajor: false,
    });
    expect(p.partial).toBe(false);
    expect(codes(p)).toEqual(["LOCAL_EDIT_CONFLICT"]);
  });

  it("treats a deleted managed file as a conflict, not something to restore", () => {
    const { manifest, files } = installV1();
    delete files[SKILL];
    const p = planUpdate({ ...ctx(manifest, files, v1_1), ids: [], allowMajor: false });
    expect(codes(p)).toEqual(["MISSING_FILE"]);
    expect(p.writes.some((w) => w.destination === SKILL)).toBe(false);
  });

  it("adopts a file the user already updated to the new content", () => {
    const { manifest, files } = installV1();
    files[SKILL] = file(skillMd("Steps v1.1."));
    const p = planUpdate({
      ...ctx(manifest, files, v1_1),
      ids: ["skill/review"],
      allowMajor: false,
    });
    expect(actions(p)).toContain(`adopt ${SKILL}`);
    expect(p.writes.some((w) => w.destination === SKILL)).toBe(false);
  });

  it("requires --allow-major for major updates", () => {
    const { manifest, files } = installV1();
    const all = planUpdate({ ...ctx(manifest, files, v2), ids: [], allowMajor: false });
    expect(all.diagnostics.map((d) => [d.code, d.severity])).toEqual([["MAJOR_UPDATE", "warning"]]);
    expect(all.manifest!.items["skill/review"]?.version).toBe("1.0.0");

    const named = planUpdate({
      ...ctx(manifest, files, v2),
      ids: ["skill/review"],
      allowMajor: false,
    });
    expect(named.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["MAJOR_UPDATE", "conflict"],
    ]);

    const allowed = planUpdate({
      ...ctx(manifest, files, v2),
      ids: ["skill/review"],
      allowMajor: true,
    });
    expect(codes(allowed)).toEqual([]);
    expect(allowed.manifest!.items["skill/review"]?.version).toBe("2.0.0");
  });

  it("deletes files dropped by a new version only if unmodified", () => {
    const at11 = installV1();
    const step = planUpdate({
      ...ctx(at11.manifest, at11.files, v1_1),
      ids: [],
      allowMajor: false,
    });
    const manifest = step.manifest!;
    const files = apply(at11.files, step);

    const clean = planUpdate({
      ...ctx(manifest, files, v2),
      ids: ["skill/review"],
      allowMajor: true,
    });
    expect(actions(clean)).toEqual([`update ${SKILL}`, `delete ${REF}`]);
    expect(clean.pruneDirs).toContain(".claude/skills/kit-review/references");

    files[REF] = file("my notes\n");
    const edited = planUpdate({
      ...ctx(manifest, files, v2),
      ids: ["skill/review"],
      allowMajor: true,
    });
    expect(codes(edited)).toEqual(["LOCAL_EDIT_CONFLICT"]);
  });

  it("rejects items that are not installed", () => {
    const { manifest, files } = installV1();
    expect(
      codes(planUpdate({ ...ctx(manifest, files), ids: ["agent/x"], allowMajor: false })),
    ).toEqual(["NOT_INSTALLED"]);
  });
});

describe("planRemove", () => {
  it("deletes unmodified files and prunes the item's own directories", () => {
    const { manifest, files } = installV1();
    const p = planRemove({ ...ctx(manifest, files), ids: ["skill/review"] });
    expect(actions(p)).toEqual([`delete ${SKILL}`]);
    expect(p.pruneDirs).toEqual([".claude/skills/kit-review"]);
    expect(p.manifest!.items["skill/review"]).toBeUndefined();
  });

  it("refuses to delete edited files", () => {
    const { manifest, files } = installV1();
    files[SKILL] = file("mine\n");
    expect(codes(planRemove({ ...ctx(manifest, files), ids: ["skill/review"] }))).toEqual([
      "LOCAL_EDIT_CONFLICT",
    ]);
  });

  it("treats already-missing files as removed", () => {
    const { manifest, files } = installV1();
    delete files[SKILL];
    const p = planRemove({ ...ctx(manifest, files), ids: ["skill/review"] });
    expect(codes(p)).toEqual([]);
    expect(p.writes).toEqual([]);
    expect(p.manifest!.items["skill/review"]).toBeUndefined();
  });

  it("removing the guidelines removes CLI-created root files and the import", () => {
    const { manifest, files } = installV1();
    const p = planRemove({ ...ctx(manifest, files), ids: ["guideline/engineering"] });
    expect(actions(p)).toEqual(["delete AGENTS.md", "delete CLAUDE.md"]);
    expect(p.manifest!.blocks).toEqual({});
    expect(p.manifest!.claudeImport).toBeUndefined();
  });

  it("keeps the context reference when the guidelines are removed", () => {
    const { manifest, files } = installV1({}, true);
    const p = planRemove({ ...ctx(manifest, files), ids: ["guideline/engineering"] });
    const agents = p.writes.find((w) => w.destination === "AGENTS.md")!;
    expect(agents.content).toContain(CONTEXT_PATH);
    expect(agents.content).not.toContain("v1");
  });
});

describe("planEject", () => {
  it("forgets items and leaves their files untouched, even if edited", () => {
    const { manifest, files } = installV1();
    files[SKILL] = file("mine\n");
    const p = planEject({ ...ctx(manifest, files), ids: ["skill/review"] });
    expect(p.writes).toEqual([]);
    expect(actions(p)).toEqual([`release ${SKILL}`]);
    expect(p.manifest!.items["skill/review"]).toBeUndefined();
  });

  it("unwraps the guidelines and import blocks, keeping their text", () => {
    const { manifest, files } = installV1({ "CLAUDE.md": file("# Team\n") }, true);
    const p = planEject({ ...ctx(manifest, files), ids: ["guideline/engineering"] });
    const out = apply(files, p);
    const agents = (out["AGENTS.md"] as { text: string }).text;
    const claude = (out["CLAUDE.md"] as { text: string }).text;
    expect(agents).not.toContain(BLOCK_START);
    expect(agents).toContain("v1");
    expect(agents).toContain(CONTEXT_PATH);
    expect(claude).toBe("# Team\n\n@AGENTS.md\n");
    expect(p.manifest!.blocks).toEqual({});
    expect(p.manifest!.contextPath).toBeUndefined();
  });
});

describe("planUninstall", () => {
  it("restores pre-existing files and keeps project-owned content", () => {
    const initial = {
      "CLAUDE.md": file("# Team\n"),
      "AGENTS.md": file("# Shared\n"),
      [CONTEXT_PATH]: file("# Our context\n"),
    };
    const { manifest, files } = installV1(initial, true);
    const p = planUninstall(ctx(manifest, files));
    const out = apply(files, p);
    expect(codes(p)).toEqual([]);
    expect(p.manifest).toBeNull();
    expect(out).toEqual(initial);
  });

  it("deletes root files the CLI created", () => {
    const { manifest, files } = installV1();
    const out = apply(files, planUninstall(ctx(manifest, files)));
    expect(out).toEqual({});
  });

  it("leaves a user-owned import alone", () => {
    const initial = { "CLAUDE.md": file("@AGENTS.md\n") };
    const { manifest, files } = installV1(initial);
    const out = apply(files, planUninstall(ctx(manifest, files)));
    expect(out).toEqual(initial);
  });

  it("cancels on edited managed content", () => {
    const { manifest, files } = installV1();
    files["AGENTS.md"] = file(`${BLOCK_START}\n\nhand edit\n\n<!-- agent-kit:end -->\n`);
    expect(codes(planUninstall(ctx(manifest, files)))).toEqual(["LOCAL_EDIT_CONFLICT"]);
  });

  it("is a no-op without a manifest", () => {
    const p = planUninstall(ctx(undefined, {}));
    expect(p.writes).toEqual([]);
    expect(p.manifestChanged).toBe(false);
  });
});
