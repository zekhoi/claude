import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentHash } from "../src/core/content.js";
import { codesOf, json, kit, wasKilled } from "./cli-helpers.js";
import { snapshotTree, tempDir, writeTree } from "./helpers.js";

const SKILL = ".claude/skills/kit-code-review/SKILL.md";
const MANIFEST = ".agent-kit/manifest.json";

async function installed(files: Record<string, string> = {}, args = ["--preset", "base"]) {
  const root = Object.keys(files).length ? await writeTree(files) : await tempDir();
  const run = await kit(root, ["init", ...args]);
  expect(run.code, run.stderr).toBe(0);
  return root;
}

/** Rewrites the manifest so an item looks installed at an older version with older content. */
async function pretendOlder(root: string, id: string, destination: string, oldContent: string) {
  const file = path.join(root, MANIFEST);
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.items[id].version = "0.9.0";
  manifest.items[id].files.find(
    (f: { destination: string }) => f.destination === destination,
  ).sha256 = contentHash(oldContent);
  await writeFile(file, JSON.stringify(manifest, null, 2));
  await writeFile(path.join(root, destination), oldContent);
}

describe("status", () => {
  it("reports when nothing is installed, without creating files", async () => {
    const root = await tempDir();
    const run = await json(root, ["status"]);
    expect(run.code).toBe(0);
    expect(run.result.data).toEqual({ installed: false });
    expect(await snapshotTree(root)).toEqual({});
  });

  it("reports installed items, local edits, and missing files", async () => {
    const root = await installed();
    await writeFile(path.join(root, SKILL), "edited\n");
    await rm(path.join(root, ".claude/rules/agent-kit/testing.md"));
    const before = await snapshotTree(root);
    const run = await json(root, ["status"]);
    expect(run.code).toBe(0);
    const items = Object.fromEntries(
      run.result.data.status.items.map((i: { id: string; files: { status: string }[] }) => [
        i.id,
        i.files.map((f) => f.status),
      ]),
    );
    expect(items).toMatchObject({
      "skill/code-review": ["modified"],
      "rule/testing": ["missing"],
      "skill/debugging": ["ok"],
      "guideline/engineering": ["ok"],
    });
    expect(run.result.data.status.blocks).toEqual([
      { path: "AGENTS.md", status: "ok" },
      { path: "CLAUDE.md", status: "ok" },
    ]);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("suggests preset items that are not installed", async () => {
    const root = await installed();
    await kit(root, ["remove", "skill/debugging"]);
    const run = await json(root, ["status"]);
    expect(run.result.data.status.suggestions).toEqual(["skill/debugging"]);
  });
});

describe("update", () => {
  it("holds back major updates unless explicitly allowed", async () => {
    const root = await installed();
    await pretendOlder(root, "skill/code-review", SKILL, "old content\n");

    const all = await json(root, ["update"]);
    expect(all.code).toBe(0);
    expect(codesOf(all.result)).toEqual(["MAJOR_UPDATE"]);
    expect(await readFile(path.join(root, SKILL), "utf8")).toBe("old content\n");

    const named = await json(root, ["update", "skill/code-review"]);
    expect(named.code).toBe(2);

    const allowed = await json(root, ["update", "skill/code-review", "--allow-major"]);
    expect(allowed.code).toBe(0);
    expect(await readFile(path.join(root, SKILL), "utf8")).toContain("name: kit-code-review");
    expect((await json(root, ["status"])).result.data.status.items[0]).toBeDefined();
  });

  it("applies other updates and exits 2 when an edited item is skipped", async () => {
    const root = await installed();
    await pretendOlder(root, "skill/code-review", SKILL, "old content\n");
    await pretendOlder(root, "skill/debugging", ".claude/skills/kit-debugging/SKILL.md", "old\n");
    await writeFile(path.join(root, SKILL), "my local edits\n");

    const run = await json(root, ["update", "--allow-major"]);
    expect(run.code).toBe(2);
    expect(run.result.status).toBe("conflict");
    expect(run.result.data.applied).toBe(true);
    expect(codesOf(run.result)).toEqual(["LOCAL_EDIT_CONFLICT"]);
    expect(await readFile(path.join(root, SKILL), "utf8")).toBe("my local edits\n");
    expect(
      await readFile(path.join(root, ".claude/skills/kit-debugging/SKILL.md"), "utf8"),
    ).toContain("name: kit-debugging");
  });

  it("previews without writing", async () => {
    const root = await installed();
    await pretendOlder(root, "skill/code-review", SKILL, "old content\n");
    const before = await snapshotTree(root);
    const run = await json(root, ["update", "--allow-major", "--dry-run"]);
    expect(run.code).toBe(0);
    expect(run.result.data.changes.map((c: { action: string }) => c.action)).toContain("update");
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("requires an installation", async () => {
    const run = await json(await tempDir(), ["update"]);
    expect(run.code).toBe(1);
    expect(codesOf(run.result)).toEqual(["NOT_INSTALLED"]);
  });
});

describe("remove and eject", () => {
  it("removes files and empty item directories", async () => {
    const root = await installed();
    expect((await kit(root, ["remove", "skill/code-review", "rule/testing"])).code).toBe(0);
    const tree = await snapshotTree(root);
    expect(tree[".claude/skills/kit-code-review/"]).toBeUndefined();
    expect(tree[".claude/rules/agent-kit/"]).toBeUndefined();
    expect(tree[".claude/skills/kit-debugging/SKILL.md"]).toBeDefined();
  });

  it("refuses to remove edited files and suggests eject", async () => {
    const root = await installed();
    await writeFile(path.join(root, SKILL), "mine\n");
    const run = await json(root, ["remove", "skill/code-review"]);
    expect(run.code).toBe(2);
    expect(run.result.diagnostics[0].action).toContain("agent-kit eject skill/code-review");
    expect(await readFile(path.join(root, SKILL), "utf8")).toBe("mine\n");
  });

  it("ejects an edited item so later updates leave it alone", async () => {
    const root = await installed();
    await writeFile(path.join(root, SKILL), "mine\n");
    expect((await kit(root, ["eject", "skill/code-review"])).code).toBe(0);
    expect(await readFile(path.join(root, SKILL), "utf8")).toBe("mine\n");
    const status = await json(root, ["status"]);
    const ids = status.result.data.status.items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain("skill/code-review");
    expect((await json(root, ["update"])).code).toBe(0);
  });
});

describe("uninstall", () => {
  it("restores a project with existing instructions exactly", async () => {
    const files = {
      "CLAUDE.md": "# Team\r\n\r\nNotes.\r\n",
      "AGENTS.md": "# Shared\n",
      "src/a.ts": "x\n",
    };
    const root = await writeTree(files);
    const before = await snapshotTree(root);
    await kit(root, ["init", "--preset", "node", "--context"]);
    await kit(root, ["add", "agent/reviewer"]);
    const run = await json(root, ["uninstall"]);
    expect(run.code).toBe(0);
    const after = await snapshotTree(root);
    // The project-owned context survives; everything else returns to its original state.
    expect(after["docs/agent-context.md"]).toContain("# Project context");
    delete after["docs/agent-context.md"];
    delete after["docs/"];
    expect(after).toEqual(before);
  });

  it("leaves an empty project empty", async () => {
    const root = await installed();
    expect((await kit(root, ["uninstall"])).code).toBe(0);
    expect(await snapshotTree(root)).toEqual({});
  });

  it("cancels everything when managed content was edited", async () => {
    const root = await installed();
    await writeFile(path.join(root, SKILL), "mine\n");
    const before = await snapshotTree(root);
    const run = await json(root, ["uninstall"]);
    expect(run.code).toBe(2);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("is a successful no-op when repeated", async () => {
    const root = await installed();
    await kit(root, ["uninstall"]);
    const again = await json(root, ["uninstall"]);
    expect(again.code).toBe(0);
    expect(again.result.data.applied).toBe(false);
  });

  it("makes no changes in dry-run mode", async () => {
    const root = await installed();
    const before = await snapshotTree(root);
    expect((await kit(root, ["uninstall", "--dry-run"])).code).toBe(0);
    expect(await snapshotTree(root)).toEqual(before);
  });
});

describe("doctor", () => {
  it("reports a healthy installation without changing anything", async () => {
    const root = await installed();
    const before = await snapshotTree(root);
    const run = await json(root, ["doctor"]);
    expect(run.code).toBe(0);
    expect(run.result.diagnostics).toEqual([]);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it("finds broken markers, a missing import, bad frontmatter, and name collisions", async () => {
    const root = await installed({ "CLAUDE.md": "@AGENTS.md\n" });
    await writeFile(path.join(root, "CLAUDE.md"), "# import removed\n");
    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    await writeFile(path.join(root, "AGENTS.md"), agents.replace("<!-- agent-kit:end -->", ""));
    const skill = await readFile(path.join(root, SKILL), "utf8");
    await writeFile(path.join(root, SKILL), skill.replace("name: kit-code-review", "name: review"));
    const other = path.join(root, ".claude/skills/our-review");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(other, { recursive: true });
    await writeFile(
      path.join(other, "SKILL.md"),
      "---\nname: kit-debugging\ndescription: x\n---\n",
    );

    const run = await json(root, ["doctor"]);
    expect(run.code).toBe(1);
    expect(codesOf(run.result)).toEqual(
      expect.arrayContaining([
        "MALFORMED_BLOCK",
        "IMPORT_MISSING",
        "INVALID_FRONTMATTER",
        "NAME_COLLISION",
        "LOCAL_EDIT_CONFLICT",
      ]),
    );
  });

  it("reports leftovers from an interrupted run as warnings", async () => {
    const root = await installed();
    await writeFile(path.join(root, `${SKILL}.agent-kit-99999.tmp`), "partial");
    const run = await json(root, ["doctor"]);
    expect(run.code).toBe(0);
    expect(codesOf(run.result)).toEqual(["LEFTOVER_FILE"]);
  });
});

describe("interrupted lifecycle commands", () => {
  const converges = async (
    setup: () => Promise<string>,
    args: string[],
    normalize: (tree: Record<string, string>) => Record<string, string> = (t) => t,
  ) => {
    const reference = await setup();
    await kit(reference, args);
    const expected = normalize(await snapshotTree(reference));
    for (let killAt = 1; ; killAt++) {
      const root = await setup();
      const run = await kit(root, args, { AGENT_KIT_TEST_KILL_AT: String(killAt) });
      if (!wasKilled(run)) {
        expect(run.code).toBe(0);
        expect(killAt, "the command should be interrupted at several steps").toBeGreaterThan(3);
        break;
      }
      const rerun = await kit(root, args);
      expect(rerun.code, `rerun after kill at step ${killAt}: ${rerun.stderr}`).toBe(0);
      expect(normalize(await snapshotTree(root)), `after kill at step ${killAt}`).toEqual(expected);
    }
  };

  it("uninstall converges after termination at any step", async () => {
    await converges(
      () => installed({ "CLAUDE.md": "# Team\n" }),
      ["uninstall"],
      (tree) => {
        // Empty directories left by an interrupted run are cosmetic.
        return Object.fromEntries(Object.entries(tree).filter(([k]) => !k.endsWith("/")));
      },
    );
  }, 60_000);

  it("update converges after termination at any step", async () => {
    await converges(async () => {
      const root = await installed();
      await pretendOlder(root, "skill/code-review", SKILL, "old content\n");
      return root;
    }, ["update", "--allow-major"]);
  }, 60_000);
});

describe("diff previews", () => {
  it("show --diff reports identical files and shows local edits", async () => {
    const root = await installed({}, ["--preset", "base", "--context"]);
    const clean = await json(root, ["show", "skill/code-review", "--diff"]);
    expect(clean.code).toBe(0);
    expect(clean.result.data.files[0]).toMatchObject({ local: "identical", diff: "" });
    const block = await json(root, ["show", "guideline/engineering", "--diff"]);
    expect(block.result.data.files[0].local).toBe("identical");

    const original = await readFile(path.join(root, SKILL), "utf8");
    await writeFile(
      path.join(root, SKILL),
      original.replace("## 1. Establish scope", "## 1. Scope it"),
    );
    const edited = await kit(root, ["show", "skill/code-review", "--diff"]);
    expect(edited.stdout).toContain("--- .claude/skills/kit-code-review/SKILL.md (yours)");
    expect(edited.stdout).toContain("+++ .claude/skills/kit-code-review/SKILL.md (bundled 1.0.0)");
    expect(edited.stdout).toContain("-## 1. Scope it");
    expect(edited.stdout).toContain("+## 1. Establish scope");
  });

  it("show --diff marks missing files", async () => {
    const root = await installed();
    await rm(path.join(root, SKILL));
    const run = await json(root, ["show", "skill/code-review", "--diff"]);
    expect(run.result.data.files[0].local).toBe("missing");
    expect(run.result.data.files[0].diff).toContain("(missing)");
  });

  it("--dry-run --diff previews each planned write without changing anything", async () => {
    const root = await installed();
    await pretendOlder(root, "skill/code-review", SKILL, "old content\n");
    const before = await snapshotTree(root);
    const run = await json(root, ["update", "--allow-major", "--dry-run", "--diff"]);
    expect(run.code).toBe(0);
    const change = run.result.data.changes.find(
      (c: { destination: string }) => c.destination === SKILL,
    );
    expect(change.diff).toContain("-old content");
    expect(change.diff).toContain("+name: kit-code-review");
    expect(await snapshotTree(root)).toEqual(before);

    const removal = await json(root, ["uninstall", "--dry-run", "--diff"]);
    const deleted = removal.result.data.changes.find(
      (c: { destination: string }) => c.destination === ".claude/rules/agent-kit/testing.md",
    );
    expect(deleted.diff).toContain("+++ /dev/null");
  });

  it("omits diffs unless requested", async () => {
    const root = await installed();
    const run = await json(root, ["uninstall", "--dry-run"]);
    expect(run.result.data.changes.some((c: { diff?: string }) => c.diff)).toBe(false);
  });
});
