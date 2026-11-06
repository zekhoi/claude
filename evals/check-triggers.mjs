#!/usr/bin/env node
// Runs the cases listed in triggers.json and checks only whether each skill or subagent was picked:
// negative cases must not pick it, and at least `minTriggered` of the other cases must.
// Usage: node evals/check-triggers.mjs [--out <dir>] [--jobs 4]
// Requires a built CLI and an authenticated `claude` on PATH (ANTHROPIC_API_KEY works).
import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const evalsDir = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const outDir = path.resolve(arg("out", mkdtempSync(path.join(tmpdir(), "agent-kit-triggers-"))));
const jobs = Number(arg("jobs", "4"));
if (!Number.isInteger(jobs) || jobs < 1) {
  console.error("--jobs must be a positive integer");
  process.exit(2);
}
const { minTriggered, cases } = JSON.parse(
  readFileSync(path.join(evalsDir, "triggers.json"), "utf8"),
);

const runCase = (entry) =>
  new Promise((resolve) => {
    const [dir, id] = entry.split("/");
    // A reused --out directory must not supply a previous run's transcript.
    rmSync(path.join(outDir, `${dir}--${id}.json`), { force: true });
    const child = spawn(
      process.execPath,
      [path.join(evalsDir, "run.mjs"), "--skill", dir, "--case", id, "--out", outDir],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    child.on("close", () => resolve(entry));
  });

const queue = [...cases];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (queue.length > 0) await runCase(queue.shift());
  }),
);

const rows = [];
let triggered = 0;
let positives = 0;
const failures = [];
for (const entry of cases) {
  const [dir, id] = entry.split("/");
  const name = `kit-${dir.replace(/^agent-/, "")}`;
  let record;
  try {
    record = JSON.parse(readFileSync(path.join(outDir, `${dir}--${id}.json`), "utf8"));
  } catch {
    failures.push(`${entry}: no transcript (the run failed)`);
    rows.push(`| \`${entry}\` | ? | no transcript |`);
    continue;
  }
  if (record.isError || record.exitCode !== 0) {
    failures.push(`${entry}: the run ended with an error (exit code ${record.exitCode})`);
    rows.push(`| \`${entry}\` | ${record.kind} | run error |`);
    continue;
  }
  const picked = (dir.startsWith("agent-") ? record.subagents : record.skillsInvoked).some(
    (s) => s === name || s === `agent-kit:${name.slice(4)}`,
  );
  if (record.kind === "negative") {
    if (picked) failures.push(`${entry}: ${name} was picked for a negative case`);
  } else {
    positives += 1;
    if (picked) triggered += 1;
  }
  rows.push(`| \`${entry}\` | ${record.kind} | ${picked ? `picked ${name}` : "not picked"} |`);
}
if (triggered < minTriggered) {
  failures.push(
    `${triggered} of ${positives} cases picked their item; the minimum is ${minTriggered}`,
  );
}

const report = [
  `## Trigger check: ${triggered} of ${positives} picked, ${failures.length} problem(s)`,
  "",
  "| Case | Kind | Result |",
  "| ---- | ---- | ------ |",
  ...rows,
  "",
  ...failures.map((f) => `- ${f}`),
  "",
  `Transcript summaries: ${outDir}`,
].join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exit(failures.length > 0 ? 1 : 0);
