# Compatibility

Status: development. Ranges marked _provisional_ have not been verified by the CI matrix and must not be published as supported until they are. Remove the marker only after the `Compatibility` workflow passes on every listed combination; the release gate (`scripts/check-release.mjs`) refuses to release while any remain.

| Component                    | Supported                   | Notes                                                                                                                                                                                                  |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js                      | >= 22.12.0 (22 LTS, 24 LTS) | Node 20 reached end of life in April 2026; 22.12 is required by `commander` 15. Enforced by `engines` and a startup check (`UNSUPPORTED_RUNTIME`). CI tests 22.12.0, the latest 22, and the latest 24. |
| Operating systems            | Linux, macOS, Windows       | All tests and package verification pass on `ubuntu-latest`, `macos-latest`, and `windows-latest` for every Node version above (first verified in the Compatibility workflow on 2026-10-12).            |
| Claude Code                  | >= 2.1.296                  | Verified end to end with 2.1.296 on 2026-10-12 (see below). Earlier versions are not supported; rerun the checks below with new releases.                                                              |
| Registry schema              | 1                           | Newer versions are rejected with `UNSUPPORTED_SCHEMA` before any write.                                                                                                                                |
| Manifest schema              | 1                           | Newer versions are rejected with `UNSUPPORTED_SCHEMA` before any write.                                                                                                                                |
| CLI output schema (`--json`) | 1                           | `outputSchemaVersion` in every JSON result.                                                                                                                                                            |

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

## User-level locations

Global installation (`--global`) relies on these documented user-level paths: Claude Code reads `~/.claude/CLAUDE.md` (with `@` imports; there is no user-level `AGENTS.md`), `~/.claude/skills/`, `~/.claude/agents/`, and `~/.claude/rules/` ([memory](https://code.claude.com/docs/en/memory), [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents)); Codex reads `~/.codex/AGENTS.md`, `~/.agents/skills/`, and `~/.codex/agents/`. User-level skills override project skills with the same name in Claude Code, while project subagents override user-level ones.

## Codex

Install with `agent-kit init --agent codex` (or `--agent claude --agent codex` for both). The registry stores the Claude Code layout; the Codex adapter derives its files from it.

| Item       | Codex location                             | Notes                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guidelines | `AGENTS.md` managed block                  | Read natively ([AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)); no `CLAUDE.md` is written unless Claude Code is also selected. Codex stops reading project instructions after `project_doc_max_bytes` (32 KiB by default) across all levels.  |
| Skills     | `.agents/skills/kit-<name>/`               | Same `SKILL.md` format ([skills](https://learn.chatgpt.com/docs/build-skills)); names are limited to 64 characters, and descriptions are kept under 1,024. Loaded without project trust.                                                                                 |
| Rules      | `.agents/skills/kit-<name>-rules/SKILL.md` | Codex has no path-scoped instruction rules (its `.rules` files govern shell commands), so each rule becomes a skill whose description names the file globs it applies to. Skills trigger on relevance rather than deterministically.                                     |
| Subagents  | `.codex/agents/kit-<name>.toml`            | TOML with `name`, `description`, and `developer_instructions` ([subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)). A Claude Code agent whose tools exclude editing tools gets `sandbox_mode = "read-only"`. **Loaded only in trusted projects.** |

### Verified in Codex

Checked on 2026-10-13 with codex-cli 0.162.1 on macOS, in a scratch git repository after `agent-kit init --preset node --agent codex` and `agent-kit add agent/reviewer agent/debugger`, using `codex exec` with the user configuration ignored.

| Check                                      | Result                                                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` guidelines block               | Pass: quoted verbatim                                                                                                                                                                                                                        |
| Skill discovery, including converted rules | Pass: all seven `kit-` skills listed (`kit-testing-rules` and `kit-typescript-rules` included) in an untrusted project                                                                                                                       |
| Subagents                                  | Pass in a trusted project: `spawn_agent` with `agent_type: "kit-reviewer"` started a subagent thread with role `kit-reviewer`, which reviewed using the code-review skill. In an untrusted project the roles are not offered, as documented. |
| Read-only sandbox for `kit-reviewer`       | Not independently verified: the parent session was already read-only                                                                                                                                                                         |

Trust is recorded by Codex itself (`[projects."<path>"] trust_level = "trusted"` in `~/.codex/config.toml`) when the user approves a project; a `-c projects....trust_level` command-line override did not enable project configuration in 0.162.1.

## Claude Code plugin

`plugins/agent-kit/` is generated from the registry with `pnpm build:plugin`, and `.claude-plugin/marketplace.json` makes this repository a plugin marketplace ([plugins](https://code.claude.com/docs/en/plugins/manifest-reference), [marketplaces](https://code.claude.com/docs/en/plugins/marketplace-reference)). Components are namespaced by the plugin, so names drop the `kit-` prefix: `/agent-kit:code-review`, subagent `agent-kit:reviewer`. Plugins cannot ship CLAUDE.md content or path-scoped rules; the guidelines become the `engineering-guidelines` skill and each rule a `*-rules` skill, which load on relevance rather than always.

Verified on 2026-10-13 with Claude Code 2.1.296: `claude plugin validate --strict` passes for the plugin and the marketplace (also in CI, without authentication); with `--plugin-dir`, all 11 skills and both subagents load under `agent-kit:`; a delegation produced an `Agent` call with `subagent_type: agent-kit:reviewer`; and `/agent-kit:code-review` produced findings in the skill's format without editing files.
