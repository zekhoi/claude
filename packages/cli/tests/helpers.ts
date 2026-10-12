import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-kit-test-"));
  created.push(dir);
  return dir;
}

/** Writes a map of relative path → content (objects are JSON-encoded) under a new temp dir. */
export async function writeTree(files: Record<string, string | object>): Promise<string> {
  const root = await tempDir();
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

export const SKILL_MD =
  "---\nname: kit-review\ndescription: Review changes for defects\n---\n\nSteps.\n";

export function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: "skill/review",
    version: "1.0.0",
    type: "skill",
    description: "Review changes",
    dependencies: [],
    files: [
      { source: "skills/review/SKILL.md", destination: ".claude/skills/kit-review/SKILL.md" },
    ],
    ...overrides,
  };
}

/** A minimal valid source registry; pass overrides to break one thing at a time. */
export function registryFiles(
  items: Record<string, unknown>[] = [item()],
  extra: Record<string, string | object> = {},
): Record<string, string | object> {
  return {
    "index.json": { schemaVersion: 1, items },
    "skills/review/SKILL.md": SKILL_MD,
    "presets/base.json": {
      schemaVersion: 1,
      id: "preset/base",
      description: "Base",
      items: ["skill/review"],
    },
    ...extra,
  };
}

export const GUIDELINE_MD = "## Guidelines\n\nBe careful.\n";

export function guidelineItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: "guideline/engineering",
    version: "1.0.0",
    type: "guideline",
    description: "Guidelines",
    dependencies: [],
    files: [
      { source: "guidelines/engineering.md", destination: "AGENTS.md", install: "managed-block" },
    ],
    ...overrides,
  };
}

/** Source registry with a guideline, a skill, and a preset containing both. */
export function fullRegistryFiles(): Record<string, string | object> {
  return registryFiles([guidelineItem(), item()], {
    "guidelines/engineering.md": GUIDELINE_MD,
    "templates/agent-context.md": "# Context\n\nTODO: fill in\n",
    "presets/base.json": {
      schemaVersion: 1,
      id: "preset/base",
      description: "Base",
      items: ["guideline/engineering", "skill/review"],
    },
  });
}

/** Lists every file under a directory with its exact content, for before/after comparisons. */
export async function snapshotTree(root: string): Promise<Record<string, string>> {
  const { readdir, readFile, lstat, readlink } = await import("node:fs/promises");
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir)) {
      const abs = path.join(dir, entry);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const info = await lstat(abs);
      if (info.isSymbolicLink()) out[rel] = `-> ${await readlink(abs)}`;
      else if (info.isDirectory()) {
        out[`${rel}/`] = "";
        await walk(abs);
      } else out[rel] = await readFile(abs, "utf8");
    }
  };
  await walk(root);
  return out;
}
