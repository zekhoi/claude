#!/usr/bin/env node
// Formats-checks and lints the files staged for commit. Run by .githooks/pre-commit.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const staged = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);
if (staged.length === 0) process.exit(0);

// Run the project's own tools through Node, so no package manager has to be on PATH. The
// executable comes from the package's declared `bin`, found in node_modules from the repo root.
function binPath(pkg, name) {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, "node_modules", pkg, "package.json");
    if (existsSync(manifest)) {
      const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
      const rel = typeof bin === "string" ? bin : bin?.[name];
      return rel ? path.join(path.dirname(manifest), rel) : undefined;
    }
    if (path.dirname(dir) === dir) return undefined;
  }
}

const run = (pkg, args) => {
  const entry = binPath(pkg, pkg);
  if (!entry) {
    console.error(`pre-commit: ${pkg} is not installed; run pnpm install first.`);
    return 1;
  }
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: "inherit" });
  if (result.error) console.error(`pre-commit: could not run ${pkg}: ${result.error.message}`);
  return result.status ?? 1;
};

let failed = run("prettier", ["--check", "--ignore-unknown", ...staged]) !== 0;
const lintable = staged.filter((f) => /\.(c|m)?[jt]s$/.test(f));
if (lintable.length > 0) {
  failed = run("eslint", ["--no-warn-ignored", ...lintable]) !== 0 || failed;
}

if (failed) {
  console.error(
    "\npre-commit: fix the problems above (`pnpm format` formats files), then commit again.",
  );
  process.exit(1);
}
