import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasErrors } from "../src/core/diagnostics.js";
import { buildRegistry, loadPackagedRegistry, loadSourceRegistry } from "../src/core/registry.js";
import { item, registryFiles, SKILL_MD, tempDir, writeTree } from "./helpers.js";

const codes = async (files: Record<string, string | object>) =>
  (await loadSourceRegistry(await writeTree(files))).diagnostics.map((d) => d.code);

describe("loadSourceRegistry", () => {
  it("accepts a valid registry", async () => {
    expect(await codes(registryFiles())).toEqual([]);
  });

  it("validates the registry in this repository", async () => {
    const root = fileURLToPath(new URL("../../../registry", import.meta.url));
    const { diagnostics } = await loadSourceRegistry(root);
    expect(diagnostics).toEqual([]);
  });

  it("rejects newer schema versions before parsing the rest", async () => {
    expect(
      await codes({ ...registryFiles(), "index.json": { schemaVersion: 2, items: "?" } }),
    ).toEqual(["UNSUPPORTED_SCHEMA"]);
  });

  it("rejects checksums in source metadata", async () => {
    const files = [
      {
        source: "skills/review/SKILL.md",
        destination: ".claude/skills/kit-review/SKILL.md",
        sha256: "0".repeat(64),
      },
    ];
    expect(await codes(registryFiles([item({ files })]))).toContain("SCHEMA_INVALID");
  });

  it("reports duplicate ids and case-insensitive destination collisions", async () => {
    const twin = item({
      id: "skill/review",
      files: [
        { source: "skills/review/SKILL.md", destination: ".claude/skills/kit-review/skill.md" },
      ],
    });
    const result = await codes(registryFiles([item(), twin]));
    expect(result).toContain("DUPLICATE_ID");
    expect(result).toContain("DESTINATION_COLLISION");
  });

  it("rejects nonempty dependencies", async () => {
    expect(await codes(registryFiles([item({ dependencies: ["rule/x"] })]))).toEqual([
      "UNSUPPORTED_DEPENDENCIES",
    ]);
  });

  it("rejects mismatched id and type", async () => {
    expect(await codes(registryFiles([item({ type: "agent" })]))).toContain("ID_TYPE_MISMATCH");
  });

  it("reports missing and escaping sources", async () => {
    const missing = item({
      files: [{ source: "skills/nope.md", destination: ".claude/skills/kit-review/SKILL.md" }],
    });
    expect(await codes(registryFiles([missing]))).toContain("MISSING_SOURCE");
    const escaping = item({
      files: [{ source: "../SKILL.md", destination: ".claude/skills/kit-review/SKILL.md" }],
    });
    expect(await codes(registryFiles([escaping]))).toContain("UNSAFE_PATH");
  });

  it("rejects symlinked source files", async () => {
    const root = await writeTree({ ...registryFiles(), "outside.md": SKILL_MD });
    const link = path.join(root, "skills/review/SKILL.md");
    await rm(link);
    await symlink(path.join(root, "outside.md"), link);
    const { diagnostics } = await loadSourceRegistry(root);
    expect(diagnostics.map((d) => d.code)).toContain("UNSAFE_PATH");
  });

  it("reports presets that reference unavailable items or mismatch their file name", async () => {
    const files = registryFiles([item()], {
      "presets/node.json": {
        schemaVersion: 1,
        id: "preset/nodejs",
        description: "N",
        items: ["rule/typescript"],
      },
    });
    const result = await codes(files);
    expect(result).toContain("UNKNOWN_PRESET_ITEM");
    expect(result).toContain("SCHEMA_INVALID");
  });

  it("validates item content frontmatter", async () => {
    expect(await codes({ ...registryFiles(), "skills/review/SKILL.md": "no frontmatter" })).toEqual(
      ["INVALID_FRONTMATTER"],
    );
  });
});

describe("buildRegistry and loadPackagedRegistry", () => {
  it("generates checksums that the packaged loader verifies", async () => {
    const source = await writeTree({
      ...registryFiles(),
      "templates/agent-context.md": "# Context\n",
    });
    const out = path.join(await tempDir(), "registry");
    expect(await buildRegistry(source, out)).toEqual([]);

    const index = JSON.parse(await readFile(path.join(out, "index.json"), "utf8"));
    expect(index.items[0].files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(path.join(out, "templates/agent-context.md"), "utf8")).toBe(
      "# Context\n",
    );

    const loaded = await loadPackagedRegistry(out);
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.value?.presets.map((p) => p.id)).toEqual(["preset/base"]);
  });

  it("accepts line-ending conversion of packaged files", async () => {
    const out = path.join(await tempDir(), "registry");
    await buildRegistry(await writeTree(registryFiles()), out);
    await writeFile(path.join(out, "skills/review/SKILL.md"), SKILL_MD.replace(/\n/g, "\r\n"));
    expect((await loadPackagedRegistry(out)).diagnostics).toEqual([]);
  });

  it("detects tampered packaged files", async () => {
    const out = path.join(await tempDir(), "registry");
    await buildRegistry(await writeTree(registryFiles()), out);
    await writeFile(path.join(out, "skills/review/SKILL.md"), `${SKILL_MD}extra\n`);
    expect((await loadPackagedRegistry(out)).diagnostics.map((d) => d.code)).toEqual([
      "CHECKSUM_MISMATCH",
    ]);
  });

  it("writes nothing when the source registry is invalid", async () => {
    const out = path.join(await tempDir(), "registry");
    const diagnostics = await buildRegistry(
      await writeTree(registryFiles([item({ dependencies: ["rule/x"] })])),
      out,
    );
    expect(hasErrors(diagnostics)).toBe(true);
    await expect(readFile(path.join(out, "index.json"))).rejects.toThrow();
  });
});
