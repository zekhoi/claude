#!/usr/bin/env node
// Runs a published version from the npm registry in a clean project.
// Usage: node scripts/smoke-published.mjs <version>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { name } = JSON.parse(readFileSync(path.join(repo, "packages/cli/package.json"), "utf8"));
const version = process.argv[2];
if (!version) throw new Error("usage: smoke-published.mjs <version>");
const spec = `${name}@${version}`;
const project = mkdtempSync(path.join(tmpdir(), "agent-kit-smoke-"));
const npx = (...args) =>
  execFileSync("npx", ["--yes", spec, ...args], {
    cwd: project,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

try {
  // The registry can take a short while to serve a new version.
  for (let attempt = 1; ; attempt++) {
    try {
      const out = npx("--version").trim();
      if (out !== version) throw new Error(`expected ${version}, got ${out}`);
      break;
    } catch (e) {
      if (attempt === 10) throw e;
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  const list = JSON.parse(npx("list", "--json"));
  if (list.status !== "ok" || list.data.items.length === 0) throw new Error("list failed");
  npx("init", "--preset", "base");
  npx("doctor");
  npx("uninstall");
  console.log(`${spec} works from the registry`);
} finally {
  rmSync(project, { recursive: true, force: true });
}
