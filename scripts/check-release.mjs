#!/usr/bin/env node
// Refuses to release until the package identity, compatibility, changelog, and skill evaluations
// are in place. Usage: node scripts/check-release.mjs <version>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(repo, rel), "utf8");
const version = process.argv[2];
const problems = [];

const pkg = JSON.parse(read("packages/cli/package.json"));
if (!version) problems.push("pass the version to release as the first argument");
else if (pkg.version !== version) {
  problems.push(`packages/cli/package.json is ${pkg.version}, not ${version}`);
}
if (/^0\.0\.0/.test(pkg.version)) problems.push("package version is still 0.0.0");
if (/yourname/i.test(pkg.name)) problems.push(`package name ${pkg.name} is a placeholder`);
if (!pkg.license || pkg.license === "UNLICENSED") problems.push("package license is not chosen");
if (pkg.license && pkg.license !== "UNLICENSED" && !existsSync(path.join(repo, "LICENSE"))) {
  problems.push("LICENSE file is missing");
}

const plugin = JSON.parse(read("plugins/agent-kit/.claude-plugin/plugin.json"));
if (plugin.version !== pkg.version) {
  problems.push(`the plugin is ${plugin.version}; run pnpm build:plugin after bumping the version`);
}

const compatibility = read("docs/compatibility.md");
// Only table rows declare ranges; the explanatory text mentions the marker itself.
if (/^\|.*_provisional_.*\|$/m.test(compatibility)) {
  problems.push("docs/compatibility.md still lists provisional ranges; verify them in CI first");
}
if (/\| *Claude Code *\| *Not yet declared/.test(compatibility)) {
  problems.push("docs/compatibility.md does not declare a Claude Code version range");
}

if (
  !existsSync(path.join(repo, "CHANGELOG.md")) ||
  !read("CHANGELOG.md").includes(`## ${version}`)
) {
  problems.push(`CHANGELOG.md has no "## ${version}" section`);
}

// Every shipped skill needs a recorded evaluation for its current version.
const index = JSON.parse(read("registry/index.json"));
for (const item of index.items.filter((i) => i.type === "skill")) {
  const name = item.id.slice("skill/".length);
  const dir = path.join(repo, "evals", name, "results");
  const records = existsSync(dir) ? readdirSync(dir) : [];
  if (!records.some((f) => f.endsWith(`-${item.version}.md`))) {
    problems.push(`${item.id}@${item.version} has no evaluation record in evals/${name}/results/`);
  }
}

if (problems.length > 0) {
  console.error(`Not ready to release ${version ?? ""}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Ready to release ${pkg.name}@${version}`);
