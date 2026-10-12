#!/usr/bin/env node
// Checks commit messages and pull request titles against this repository's convention:
// a capitalized, imperative subject of at most 72 characters without a trailing period or a
// Conventional Commits prefix, then a blank line before any body.
//
// Usage: check-commit-message.mjs <commit-message-file>   (commit-msg hook)
//        check-commit-message.mjs --title "<PR title>"     (CI; squash merges use the title)
import { readFileSync } from "node:fs";

const SUBJECT_MAX = 72;
// Squash merges append " (#123)" to the PR title, so titles leave room for it.
const TITLE_MAX = SUBJECT_MAX - 8;
// Subjects git or GitHub generate, and autosquash markers, are accepted as they are.
const GENERATED = /^(Merge |Revert "|fixup! |squash! |amend! )/;
const PAST_TENSE = /^(Added|Fixed|Updated|Removed|Changed|Implemented|Refactored|Improved)\b/;

export function checkMessage(message, { title = false } = {}) {
  const lines = message
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !line.startsWith("#"));
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  const subject = lines[0] ?? "";
  const problems = [];
  if (subject.trim() === "") return ["the subject is empty"];
  if (GENERATED.test(subject)) return [];

  const max = title ? TITLE_MAX : SUBJECT_MAX;
  if (subject.length > max) {
    problems.push(
      `the ${title ? "title" : "subject"} is ${subject.length} characters; keep it at most ${max}`,
    );
  }
  if (/^[a-z][a-z0-9-]*(\([^)]*\))?!?: /.test(subject)) {
    problems.push(
      'drop the type prefix; this repository writes subjects like "Add a Codex adapter"',
    );
  } else if (!/^[A-Z0-9]/.test(subject)) {
    problems.push("start the subject with a capital letter");
  }
  if (/[.!?]$/.test(subject.trim()))
    problems.push("remove the trailing punctuation from the subject");
  if (PAST_TENSE.test(subject)) {
    problems.push('use the imperative mood ("Add", "Fix"), not the past tense');
  }
  if (!title && lines.length > 1 && lines[1].trim() !== "") {
    problems.push("leave a blank line between the subject and the body");
  }
  return problems;
}

const args = process.argv.slice(2);
if (args.length > 0) {
  const title = args[0] === "--title";
  const message = title ? (args[1] ?? "") : readFileSync(args[0], "utf8");
  const problems = checkMessage(message, { title });
  if (problems.length > 0) {
    console.error(
      `${title ? "Pull request title" : "Commit message"} does not follow the convention:`,
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('  Example: "Add diff previews for conflicts and planned changes"');
    process.exit(1);
  }
}
