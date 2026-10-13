#!/usr/bin/env node
// Runs skill evaluation cases with Claude Code and saves one transcript summary per case.
// Judging the expectations is a separate, human (or reviewing-agent) step; see README.md.
//
// Usage: node evals/run.mjs [--skill <id>] [--case <id>] [--model sonnet] [--budget 1] [--out <dir>]
// Requires a built CLI (`pnpm -r run build`) and an authenticated `claude` on PATH.
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const evalsDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(evalsDir, "..");
const cli = path.join(repo, "packages/cli/dist/index.js");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const model = arg("model", "sonnet");
const budget = arg("budget", "1");
const outDir = path.resolve(arg("out", mkdtempSync(path.join(tmpdir(), "agent-kit-evals-"))));
const onlySkill = arg("skill");
const onlyCase = arg("case");

// Tools the agent may use. Edits are allowed so "does not modify files" is a real boundary.
const ALLOWED_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "Edit",
  "Write",
  "Skill",
  "Bash(node --test*)",
  "Bash(npm test*)",
  "Bash(git diff*)",
  "Bash(git status*)",
  "Bash(git log*)",
];
// Every skill is installed in each case, so negative cases test real triggering.
const SKILLS = JSON.parse(readFileSync(path.join(repo, "registry/index.json"), "utf8"))
  .items.filter((i) => i.type === "skill")
  .map((i) => i.id);

const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * Builds a git repository for a case: the fixture and agent-kit in an initial commit on `main`,
 * then optional `history` commits, an optional `branch` with commits, and optional uncommitted
 * `changes` (`staged: true` stages them).
 */
function setUpProject(skillDir, c) {
  const project = mkdtempSync(path.join(tmpdir(), "agent-kit-eval-project-"));
  if (c.fixture) cpSync(path.join(skillDir, c.fixture), project, { recursive: true });
  const write = (files) => {
    for (const [rel, content] of Object.entries(files ?? {})) {
      mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
      writeFileSync(path.join(project, rel), content);
    }
  };
  // Fixtures that need real dependencies (for example to run tests) declare `install: true`.
  if (c.install) {
    sh("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], project);
    writeFileSync(path.join(project, ".gitignore"), "node_modules/\n");
  }
  sh("git", ["init", "-q", "-b", "main"], project);
  sh("git", ["config", "user.email", "eval@example.com"], project);
  sh("git", ["config", "user.name", "eval"], project);
  sh("node", [cli, "init", "--preset", "base", "--cwd", project], project);
  sh("node", [cli, "add", ...SKILLS, "--cwd", project], project);
  sh("git", ["add", "-A"], project);
  sh("git", ["commit", "-q", "-m", "Initial commit"], project);
  for (const message of c.history ?? []) {
    sh("git", ["commit", "-q", "--allow-empty", "-m", message], project);
  }
  if (c.branch) {
    sh("git", ["switch", "-q", "-c", c.branch.name], project);
    for (const commit of c.branch.commits) {
      write(commit.files);
      sh("git", ["add", "-A"], project);
      sh("git", ["commit", "-q", "-m", commit.message], project);
    }
  }
  write(c.changes);
  if (c.staged) sh("git", ["add", "-A"], project);
  return project;
}

function runClaude(project, prompt, extraTools = []) {
  const args = [
    "-p",
    prompt,
    "--model",
    model,
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-budget-usd",
    budget,
    "--output-format",
    "stream-json",
    "--verbose",
    "--allowedTools",
    ...ALLOWED_TOOLS,
    ...extraTools,
  ];
  return new Promise((resolve) => {
    const child = spawn("claude", args, { cwd: project, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), 15 * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function summarize(stream) {
  const toolUses = [];
  let result;
  for (const line of stream.split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "assistant") {
      for (const c of event.message?.content ?? []) {
        if (c.type === "tool_use") toolUses.push({ name: c.name, input: c.input });
      }
    }
    if (event.type === "result") result = event;
  }
  return {
    skillsInvoked: toolUses
      .filter((t) => t.name === "Skill")
      .map((t) => t.input?.skill ?? t.input?.command ?? t.input),
    subagents: toolUses
      .filter((t) => t.name === "Agent" || t.name === "Task")
      .map((t) => t.input?.subagent_type),
    toolUses: toolUses.map((t) => `${t.name} ${JSON.stringify(t.input).slice(0, 160)}`),
    finalText: result?.result ?? "",
    costUsd: result?.total_cost_usd,
    turns: result?.num_turns,
    isError: result?.is_error ?? true,
  };
}

mkdirSync(outDir, { recursive: true });
const rows = [];
for (const skill of readdirSync(evalsDir).sort()) {
  const skillDir = path.join(evalsDir, skill);
  const casesFile = path.join(skillDir, "cases.json");
  if (!existsSync(casesFile) || (onlySkill && onlySkill !== skill)) continue;
  const { cases } = JSON.parse(readFileSync(casesFile, "utf8"));
  for (const c of cases) {
    if (onlyCase && onlyCase !== c.id) continue;
    process.stderr.write(`running ${skill}/${c.id} ...\n`);
    const project = setUpProject(skillDir, c);
    const run = await runClaude(project, c.prompt, c.allowedTools);
    const summary = summarize(run.stdout);
    const changedFiles = sh("git", ["status", "--porcelain"], project)
      .trim()
      .split("\n")
      .filter(Boolean);
    const diff = sh("git", ["diff", "HEAD"], project).slice(0, 8000);
    const logAfter = sh("git", ["log", "--all", "--format=%h %s%n%b", "-6"], project).trim();
    const committedFiles = sh(
      "git",
      ["show", "--name-status", "--format=", "HEAD"],
      project,
    ).trim();
    let tests;
    if (existsSync(path.join(project, "package.json"))) {
      try {
        tests = { passed: true, output: sh("node", ["--test"], project).slice(-600) };
      } catch (e) {
        tests = { passed: false, output: String(e.stdout ?? "").slice(-600) };
      }
    }
    const record = {
      skill,
      case: c.id,
      kind: c.kind,
      prompt: c.prompt,
      expectations: c.expectations,
      model,
      claudeVersion: sh("claude", ["--version"], project).trim(),
      exitCode: run.code,
      ...summary,
      changedFiles,
      diff,
      logAfter,
      committedFiles,
      testsAfter: tests,
      project,
    };
    writeFileSync(
      path.join(outDir, `${skill}--${c.id}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    rows.push(
      `${skill}/${c.id}: skills=${JSON.stringify(summary.skillsInvoked)} changed=${changedFiles.length} cost=$${summary.costUsd?.toFixed?.(3)}`,
    );
  }
}
console.log(rows.join("\n"));
console.log(`\ntranscript summaries in ${outDir}`);
