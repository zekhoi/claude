import { describe, expect, it } from "vitest";
import { workspacePackages } from "../src/core/workspaces.js";
import { kit } from "./cli-helpers.js";
import { writeTree } from "./helpers.js";
import { homeEnv } from "./cli-helpers.js";

const tree = (extra: Record<string, string | object>) =>
  writeTree({
    "packages/api/package.json": "{}",
    "packages/web/package.json": "{}",
    "packages/legacy/package.json": "{}",
    "packages/node_modules/dep/package.json": "{}",
    "tools/lint-rules/package.json": "{}",
    "tools/deep/a/b/package.json": "{}",
    ...extra,
  });

describe("workspacePackages", () => {
  it("expands pnpm-workspace.yaml patterns with exclusions", async () => {
    const root = await tree({
      "pnpm-workspace.yaml":
        "packages:\n  - packages/*\n  - '!packages/legacy'\n  - tools/lint-*\n",
    });
    expect(await workspacePackages(root)).toEqual([
      "packages/api",
      "packages/web",
      "tools/lint-rules",
    ]);
  });

  it("reads package.json workspaces in array and object form", async () => {
    expect(
      await workspacePackages(
        await tree({ "package.json": { workspaces: ["packages/api", "./tools/*/"] } }),
      ),
    ).toEqual(["packages/api", "tools/deep", "tools/lint-rules"]);
    expect(
      await workspacePackages(
        await tree({ "package.json": { workspaces: { packages: ["packages/web"] } } }),
      ),
    ).toEqual(["packages/web"]);
  });

  it("expands ** recursively but skips node_modules and parent directories", async () => {
    const root = await tree({
      "pnpm-workspace.yaml": "packages:\n  - 'packages/**'\n  - '../outside/*'\n",
    });
    const found = await workspacePackages(root);
    expect(found).toContain("packages/api");
    expect(found.some((p) => p.includes("node_modules"))).toBe(false);
    expect(found.some((p) => p.startsWith(".."))).toBe(false);
  });

  it("returns nothing without workspace declarations", async () => {
    expect(await workspacePackages(await tree({}))).toEqual([]);
  });
});

describe("doctor at a monorepo root", () => {
  it("warns about items also installed by a workspace package", async () => {
    const root = await tree({ "pnpm-workspace.yaml": "packages:\n  - packages/*\n" });
    const home = await writeTree({});
    const env = homeEnv(home);
    await kit(root, ["init", "--preset", "base"], env);
    await kit(`${root}/packages/api`, ["add", "skill/code-review", "skill/refactoring"], env);
    await kit(`${root}/tools/lint-rules`, ["add", "skill/debugging"], env);

    const run = await kit(root, ["doctor", "--json"], env);
    expect(run.code).toBe(0);
    const overlap = (
      JSON.parse(run.stdout).diagnostics as { code: string; message: string; action: string }[]
    ).filter((d) => d.code === "SCOPE_OVERLAP");
    expect(overlap).toHaveLength(1);
    expect(overlap[0]!.message).toContain(
      "skill/code-review is installed here and in the workspace package packages/api",
    );
    expect(overlap[0]!.action).toContain("--cwd packages/api");
  });
});
