# Compatibility

Status: development. Ranges marked _provisional_ are not yet verified by the CI matrix (Phase 4) and must not be published as supported until they are.

| Component                    | Supported                                   | Notes                                                                                                                                                        |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js                      | >= 22.12.0 (22 LTS, 24 LTS) — _provisional_ | Node 20 reached end of life in April 2026. 22.12 is required by `commander` 15. Enforced by `engines` and a startup check (`UNSUPPORTED_RUNTIME`).           |
| Operating systems            | Linux, macOS, Windows — _provisional_       | Verified locally on macOS only.                                                                                                                              |
| Claude Code                  | Not yet declared                            | Formats below were checked against the documentation on 2026-10-12 with Claude Code 2.1.296 installed. Native `AGENTS.md` loading requires 2.1.277 or later. |
| Registry schema              | 1                                           | Newer versions are rejected with `UNSUPPORTED_SCHEMA` before any write.                                                                                      |
| Manifest schema              | 1                                           | Newer versions are rejected with `UNSUPPORTED_SCHEMA` before any write.                                                                                      |
| CLI output schema (`--json`) | 1                                           | `outputSchemaVersion` in every JSON result.                                                                                                                  |

## Claude Code format assumptions

Recheck these against the official documentation before changing the adapter.

| Behavior                                                                                                                                                 | Source                                                                          | Adapter consequence                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `.md` files in `.claude/rules/` subdirectories are discovered recursively. `paths:` accepts a glob string or a list; unscoped rules load at launch.      | [Rules](https://code.claude.com/docs/en/memory#organize-rules-with-clauderules) | Rules install to `.claude/rules/agent-kit/<name>.md`; `paths` is validated as a string or string list.                  |
| Skill `name` defaults to the directory name; `description` is capped at 1,536 characters; invoked as `/<name>`.                                          | [Skills](https://code.claude.com/docs/en/skills)                                | Folder and frontmatter `name` are both `kit-<name>`; descriptions over 1,536 characters are rejected.                   |
| Subagents require `name` and `description`; the file name need not match `name`.                                                                         | [Subagents](https://code.claude.com/docs/en/sub-agents)                         | Agents install to `.claude/agents/kit-<name>.md` with `name: kit-<name>` by convention.                                 |
| `AGENTS.md` is read natively only when no `CLAUDE.md` exists; `@AGENTS.md` imported from `CLAUDE.md` is not loaded twice. Imports nest at most 4 levels. | [Memory](https://code.claude.com/docs/en/memory)                                | The CLI keeps the `@AGENTS.md` bridge in `CLAUDE.md`, since most projects already have a `CLAUDE.md`.                   |
| `CLAUDE.md`, rules, and skills in nested directories load on demand when Claude works in that directory.                                                 | [Large codebases](https://code.claude.com/docs/en/large-codebases)              | Package-level installations in a monorepo are discoverable; root and package installs should not install the same item. |
