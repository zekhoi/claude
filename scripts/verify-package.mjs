#!/usr/bin/env node
// Packs the CLI, inspects the tarball, installs it into a clean project, and exercises it there.
// Usage: node scripts/verify-package.mjs [--out <dir>]   (run after `pnpm -r run build`)
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(repo, "packages/cli");
const outArg = process.argv.indexOf("--out");
const outDir = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(repo, "artifacts"));
const isWindows = process.platform === "win32";
const failures = [];

const check = (ok, message) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
};
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  });

// 1. Pack and inspect the tarball contents.
mkdirSync(outDir, { recursive: true });
const [packed] = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", outDir], pkgDir));
const files = new Set(packed.files.map((f) => f.path));
const tarball = path.join(outDir, packed.filename);
console.log(`packed ${packed.filename} (${packed.files.length} files, ${packed.size} bytes)`);

const index = JSON.parse(readFileSync(path.join(pkgDir, "dist/registry/index.json"), "utf8"));
const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/cli.js",
  "dist/registry/index.json",
  "dist/registry/templates/agent-context.md",
  ...index.items.flatMap((i) => i.files.map((f) => `dist/registry/${f.source}`)),
];
for (const file of required) check(files.has(file), `tarball contains ${file}`);
const forbidden = [...files].filter((f) =>
  /^(src|tests)\/|^dist\/scripts\/|\.ts$|\.test\./.test(f),
);
check(
  forbidden.length === 0,
  `tarball excludes sources, tests, and build scripts ${forbidden.join(", ")}`,
);

const manifest = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
check(manifest.bin?.["agent-kit"] === "dist/index.js", "bin agent-kit points to dist/index.js");
check(
  typeof manifest.engines?.node === "string",
  `engines.node is declared (${manifest.engines?.node})`,
);
check(
  readFileSync(path.join(pkgDir, "dist/index.js"), "utf8").startsWith("#!/usr/bin/env node\n"),
  "dist/index.js starts with a node shebang",
);

// 2. Install into a clean project and exercise the installed binary.
const project = mkdtempSync(path.join(tmpdir(), "agent-kit-verify-"));
try {
  writeFileSync(
    path.join(project, "package.json"),
    '{ "name": "verify-project", "private": true }\n',
  );
  writeFileSync(path.join(project, "CLAUDE.md"), "# Existing instructions\n");
  run("npm", ["install", "--no-audit", "--no-fund", tarball], project);

  const kit = (...args) => {
    try {
      return { code: 0, stdout: run("npx", ["--no-install", "agent-kit", ...args], project) };
    } catch (e) {
      return {
        code: e.status ?? 1,
        stdout: String(e.stdout ?? ""),
        stderr: String(e.stderr ?? ""),
      };
    }
  };
  const tree = () => {
    const out = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (dir === project && ["node_modules", "package.json", "package-lock.json"].includes(name))
          continue;
        const abs = path.join(dir, name);
        out.push(path.relative(project, abs).split(path.sep).join("/"));
        if (statSync(abs).isDirectory()) walk(abs);
      }
    };
    walk(project);
    return out.sort();
  };

  const listed = kit("list", "--json");
  const list = listed.code === 0 ? JSON.parse(listed.stdout) : undefined;
  check(
    list?.status === "ok" && list.data.items.length === index.items.length,
    "list --json reports the bundled catalog",
  );

  const before = tree();
  check(
    kit("init", "--preset", "node", "--context", "--dry-run").code === 0,
    "init --dry-run exits 0",
  );
  check(JSON.stringify(tree()) === JSON.stringify(before), "init --dry-run writes nothing");

  check(
    kit("init", "--preset", "node", "--context").code === 0,
    "init --preset node --context exits 0",
  );
  check(
    readFileSync(path.join(project, "CLAUDE.md"), "utf8").startsWith("# Existing instructions\n"),
    "existing CLAUDE.md content is preserved",
  );
  check(tree().includes(".claude/skills/kit-code-review/SKILL.md"), "skills are installed");
  check(kit("init", "--preset", "node", "--context").code === 0, "repeated init exits 0");
  check(kit("doctor").code === 0, "doctor finds no problems");

  const status = JSON.parse(kit("status", "--json").stdout);
  check(
    status.data.status.items.every((i) => i.files.every((f) => f.status === "ok")),
    "status reports every installed file as ok",
  );

  check(kit("uninstall").code === 0, "uninstall exits 0");
  const remaining = tree();
  check(
    JSON.stringify(remaining) === JSON.stringify(["CLAUDE.md", "docs", "docs/agent-context.md"]),
    `uninstall leaves only user-owned files (${remaining.join(", ")})`,
  );
  check(
    readFileSync(path.join(project, "CLAUDE.md"), "utf8") === "# Existing instructions\n",
    "CLAUDE.md is restored exactly",
  );
} finally {
  rmSync(project, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nall checks passed; tarball at ${path.relative(repo, tarball)}`);
