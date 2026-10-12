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
