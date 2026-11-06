---
name: orchestrate
description: Plan and run a multi-step engineering task by splitting it into steps, assigning each step to the installed kit skill or subagent that fits (for example agent-kit:architect for design or agent-kit:planner for a step plan, agent-kit:feature-implementation to build, agent-kit:test-writing, agent-kit:documentation, agent-kit:reviewer to review), running dependent steps in order and independent steps as parallel subagents with separate file scopes, and verifying the combined result. Use when a request spans several workflows (build, test, document, review), touches several independent modules or packages, or the user asks to orchestrate, delegate, plan and execute, or use subagents. Do not use for a single focused change that one skill covers (use that skill; for a change across monorepo packages, agent-kit:monorepo-change), for questions, or for code review alone (use agent-kit:code-review).
---

# Orchestrate

## 1. Understand the whole task

- Restate the goal, the deliverables, and the constraints. Read project instructions and enough of the code to know which modules, packages, or services are involved.
- Ask only about decisions that change the plan (scope, target modules, whether to open a PR). Otherwise state assumptions and continue.

## 2. Plan

- Use the skills and subagents your tools show as available, so steps are only assigned to what exists. As a fallback, look for kit items in the project or home directory: `.claude/skills/kit-*` and `.claude/agents/kit-*` (Claude Code), `.agents/skills/kit-*` and `.codex/agents/kit-*.toml` (Codex), or the plugin's `agent-kit:` names. Use agent-kit:architect for design trade-offs and agent-kit:planner, when installed, for a step plan of a large or unclear task.
- Break the task into steps. For each, record: the goal, the owner (a kit skill, a kit subagent, or yourself), the files or area it touches, what it depends on, and how it is verified.
- Group steps that can run in parallel: they must be independent and touch disjoint files, so their results apply cleanly. Steps that edit the same files, depend on each other's output, or change shared contracts (schemas, APIs, lockfiles) run in order.
- In a Git repository, every parallel group that edits files runs one subagent per Git worktree. Use the shared working tree only for read-only subagents, a single delegated step, or a directory that is not a Git repository.
- Show the plan briefly before executing when it has more than three steps or any parallel group.

## 3. Execute

- For a step owned by a skill, invoke that skill and follow it. For a step owned by a subagent, give it a self-contained prompt: the goal, the working directory, the exact scope and files it may change, the files it must not touch, constraints from project instructions, and the verification to run and report. Tell every subagent not to commit, push, stash, check out, or reset, and not to touch any directory other than its own: the orchestrator owns Git state.
- Run a parallel group as separate subagents in one batch; keep groups small (two to four agents) and never let two of them edit the same file.
- After each step or group, check the result yourself: read the diff, run the step's verification, and fix or re-delegate failures before moving on. Do not trust a subagent's success claim without evidence.
- Stop and ask the user if a step reveals that the plan is wrong, needs a destructive or outward-facing action (pushing, publishing, deploying, deleting data), or conflicts with project instructions.

### Parallel groups in worktrees

- Before creating any worktree, run `git status --short` in the user's tree. Worktrees start from `HEAD`, so uncommitted changes are not in them. If files the group will touch have uncommitted changes, ask the user before committing anything, or run that group in the shared tree under the rules above.
- Create one worktree per subagent. In Claude Code, start the subagent with `isolation: "worktree"`. Otherwise (including Codex), run `git worktree add <directory outside the repository> -b kit/<task>-<n> HEAD` and give the subagent that path as its only working directory. Tell each subagent to read and write only paths inside its worktree, never the user's tree by absolute path.
- Inside its worktree a subagent may install dependencies and run builds and tests. Do not bring lockfile or generated-file changes back unless the step was meant to change them.
- When a subagent finishes, check its worktree yourself (read the diff, run its verification). Then export and apply the result to the user's tree as uncommitted changes: in the worktree run `git add -A && git diff --cached --binary HEAD > <patch>`, and in the user's tree run `git apply --check <patch>` followed by `git apply <patch>`. If a patch does not apply, stop and report the conflict instead of forcing it. After applying, confirm that `git diff` in the user's tree contains exactly the reviewed changes. Never commit to the user's branch.
- Clean up every worktree before reporting, even when you stop on a conflict, including failed ones and those Claude Code created (use the path and branch it reports): `git worktree remove --force <path>`, `git branch -D <branch>`, and `git worktree prune`, then remove the `.claude/worktrees` directory if it is left empty. Report anything that could not be removed.

## 4. Integrate and verify

Run the project's full checks (build, type check, lint, tests) on the combined changes in the user's tree, and use `agent-kit:reviewer` or agent-kit:code-review for an independent review when the change is substantial.

## 5. Report

Summarize the plan as executed (steps, owners, what ran in parallel), what changed, verification results, review findings and how they were handled, and anything skipped or left for the user.

## Examples

- Use: "Add due dates to todos, with tests and docs, and get it reviewed." "Add input validation to packages/api and packages/worker." "Plan and execute the migration to the new logger using subagents."
- Skip: "Fix the typo in README." "Add a POST /users endpoint." (agent-kit:fastify-api or agent-kit:feature-implementation) "Review my branch." (agent-kit:code-review)
