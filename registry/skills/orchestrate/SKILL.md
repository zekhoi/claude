---
name: kit-orchestrate
description: Plan and run a multi-step engineering task by splitting it into steps, assigning each step to the installed kit skill or subagent that fits (for example kit-architect for design or kit-planner for a step plan, kit-feature-implementation to build, kit-test-writing, kit-documentation, kit-reviewer to review), running dependent steps in order and independent steps as parallel subagents with separate file scopes, and verifying the combined result. Use when a request spans several workflows (build, test, document, review), touches several independent modules or packages, or the user asks to orchestrate, delegate, plan and execute, or use subagents. Do not use for a single focused change that one skill covers (use that skill), for questions, or for code review alone (use kit-code-review).
---

# Orchestrate

## 1. Understand the whole task

- Restate the goal, the deliverables, and the constraints. Read project instructions and enough of the code to know which modules, packages, or services are involved.
- Ask only about decisions that change the plan (scope, target modules, whether to open a PR). Otherwise state assumptions and continue.

## 2. Plan

- Use the skills and subagents your tools show as available, so steps are only assigned to what exists. As a fallback, look for kit items in the project or home directory: `.claude/skills/kit-*` and `.claude/agents/kit-*` (Claude Code), `.agents/skills/kit-*` and `.codex/agents/kit-*.toml` (Codex), or the plugin's `agent-kit:` names. Use kit-architect for design trade-offs and kit-planner, when installed, for a step plan of a large or unclear task.
- Break the task into steps. For each, record: the goal, the owner (a kit skill, a kit subagent, or yourself), the files or area it touches, what it depends on, and how it is verified.
- Group steps that can run in parallel: they must be independent and touch disjoint files. Steps that edit the same files, depend on each other's output, or change shared contracts (schemas, APIs, lockfiles) run in order.
- Show the plan briefly before executing when it has more than three steps or any parallel group.

## 3. Execute

- For a step owned by a skill, invoke that skill and follow it. For a step owned by a subagent, give it a self-contained prompt: the goal, the exact scope and files it may change, the files it must not touch, constraints from project instructions, and the verification to run and report. Tell every subagent not to commit, push, stash, check out, reset, or install dependencies: the orchestrator owns Git state and lockfiles, and parallel agents share one working tree.
- Run a parallel group as separate subagents in one batch; keep groups small (two to four agents) and never let two of them edit the same file.
- After each step or group, check the result yourself: read the diff, run the step's verification, and fix or re-delegate failures before moving on. Do not trust a subagent's success claim without evidence.
- Stop and ask the user if a step reveals that the plan is wrong, needs a destructive or outward-facing action (pushing, publishing, deploying, deleting data), or conflicts with project instructions.

## 4. Integrate and verify

Run the project's full checks (build, type check, lint, tests) on the combined changes, and use `kit-reviewer` or kit-code-review for an independent review when the change is substantial.

## 5. Report

Summarize the plan as executed (steps, owners, what ran in parallel), what changed, verification results, review findings and how they were handled, and anything skipped or left for the user.

## Examples

- Use: "Add due dates to todos, with tests and docs, and get it reviewed." "Add input validation to packages/api and packages/worker." "Plan and execute the migration to the new logger using subagents."
- Skip: "Fix the typo in README." "Add a POST /users endpoint." (kit-fastify-api or kit-feature-implementation) "Review my branch." (kit-code-review)
