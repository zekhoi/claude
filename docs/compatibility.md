# Compatibility

Status: development. Ranges marked _provisional_ have not been verified by the CI matrix and must not be published as supported until they are. Remove the marker only after the `Compatibility` workflow passes on every listed combination; the release gate (`scripts/check-release.mjs`) refuses to release while any remain.

| Component                    | Supported                                   | Notes                                                                                                                                              |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                      | >= 22.12.0 (22 LTS, 24 LTS) — _provisional_ | Node 20 reached end of life in April 2026. 22.12 is required by `commander` 15. Enforced by `engines` and a startup check (`UNSUPPORTED_RUNTIME`). |
| Operating systems            | Linux, macOS, Windows — _provisional_       | Verified locally on macOS only.                                                                                                                    |
| Claude Code                  | >= 2.1.296 — _provisional_                  | Verified end to end with 2.1.296 on 2026-10-12 (see below). Earlier versions are untested.                                                         |
| Registry schema              | 1                                           | Newer versions are rejected with `UNSUPPORTED_SCHEMA` before any write.                                                                            |
| Manifest schema              | 1                                           | Newer versions are rejected with `UNSUPPORTED_SCHEMA` before any write.                                                                            |
| CLI output schema (`--json`) | 1                                           | `outputSchemaVersion` in every JSON result.                                                                                                        |

## Claude Code format assumptions

Recheck these against the official documentation before changing the adapter.

| Behavior                                                                                                                                                 | Source                                                                          | Adapter consequence                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `.md` files in `.claude/rules/` subdirectories are discovered recursively. `paths:` accepts a glob string or a list; unscoped rules load at launch.      | [Rules](https://code.claude.com/docs/en/memory#organize-rules-with-clauderules) | Rules install to `.claude/rules/agent-kit/<name>.md`; `paths` is validated as a string or string list.                  |
| Skill `name` defaults to the directory name; `description` is capped at 1,536 characters; invoked as `/<name>`.                                          | [Skills](https://code.claude.com/docs/en/skills)                                | Folder and frontmatter `name` are both `kit-<name>`; descriptions over 1,536 characters are rejected.                   |
| Subagents require `name` and `description`; the file name need not match `name`.                                                                         | [Subagents](https://code.claude.com/docs/en/sub-agents)                         | Agents install to `.claude/agents/kit-<name>.md` with `name: kit-<name>` by convention.                                 |
| `AGENTS.md` is read natively only when no `CLAUDE.md` exists; `@AGENTS.md` imported from `CLAUDE.md` is not loaded twice. Imports nest at most 4 levels. | [Memory](https://code.claude.com/docs/en/memory)                                | The CLI keeps the `@AGENTS.md` bridge in `CLAUDE.md`, since most projects already have a `CLAUDE.md`.                   |
| `CLAUDE.md`, rules, and skills in nested directories load on demand when Claude works in that directory.                                                 | [Large codebases](https://code.claude.com/docs/en/large-codebases)              | Package-level installations in a monorepo are discoverable; root and package installs should not install the same item. |

## Verified in Claude Code

Checked on 2026-10-12 with Claude Code 2.1.296 on macOS, in a scratch git repository after `agent-kit init --preset node` and `agent-kit add agent/reviewer agent/debugger`. Sessions ran with `claude -p --setting-sources project --strict-mcp-config` so only the project's own configuration was loaded.

| Check                             | Result                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` → `@AGENTS.md` import | Pass: the session quoted the managed guidelines from `AGENTS.md` verbatim                                 |
| Skill discovery                   | Pass: `kit-code-review`, `kit-debugging`, `kit-feature-implementation` listed                             |
| Subagent discovery and delegation | Pass: `kit-debugger` and `kit-reviewer` listed; a delegated review invoked `kit-reviewer`                 |
| Path-scoped rules                 | Pass: `TypeScript conventions` loaded after reading a `.ts` file; `Testing conventions` correctly did not |
| `/kit-code-review` invocation     | Pass: findings with severity, `file:line`, scenario, and fix; no files modified                           |

Rerun these checks with a new Claude Code version before widening the supported range.
