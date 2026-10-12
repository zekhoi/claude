import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tempDir } from "./helpers.js";

const script = fileURLToPath(new URL("../../../scripts/check-commit-message.mjs", import.meta.url));

async function checkMessage(message: string) {
  const file = path.join(await tempDir(), "COMMIT_EDITMSG");
  writeFileSync(file, message);
  const run = spawnSync(process.execPath, [script, file], { encoding: "utf8" });
  return { ok: run.status === 0, stderr: run.stderr };
}

const checkTitle = (title: string) => {
  const run = spawnSync(process.execPath, [script, "--title", title], { encoding: "utf8" });
  return { ok: run.status === 0, stderr: run.stderr };
};

describe("check-commit-message", () => {
  it.each([
    "Add a Codex adapter\n",
    "Fix Codex adapter issues found in review\n\nBody explaining why.\n",
    "Add diff previews\n\n# Please enter the commit message\n",
    'Revert "Add a Codex adapter"\n',
    "fixup! Add a Codex adapter\n",
    "Merge branch 'main' into feature\n",
  ])("accepts %j", async (message) => {
    expect((await checkMessage(message)).ok).toBe(true);
  });

  it.each([
    ["feat(api): add endpoint\n", "type prefix"],
    ["add a Codex adapter\n", "capital letter"],
    ["Add a Codex adapter.\n", "trailing punctuation"],
    ["Added a Codex adapter\n", "imperative"],
    [`Add ${"x".repeat(80)}\n`, "at most 72"],
    ["Add a Codex adapter\nBody without a blank line\n", "blank line"],
    ["\n\n", "empty"],
  ])("rejects %j", async (message, problem) => {
    const result = await checkMessage(message);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(problem);
  });

  it("leaves room for the squash-merge suffix in pull request titles", () => {
    expect(checkTitle("Add commit, pull-request, and security-audit skills").ok).toBe(true);
    expect(checkTitle(`Add ${"x".repeat(62)}`).ok).toBe(false);
    expect(checkTitle(`Add ${"x".repeat(62)}`).stderr).toContain("at most 64");
  });
});
