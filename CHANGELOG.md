# Changelog

All notable changes to the CLI and its bundled catalog. Item versions are listed per release; see [versioning rules](docs/PLAN.md#content-versioning).

## 0.1.0

First release. Published as `@zekhoi/agent-kit`.

### CLI

- Commands: `list`, `show`, `init`, `add`, `status`, `update`, `remove`, `eject`, `doctor`, `uninstall`, with `--cwd`, `--json`, and `--dry-run`.
- Managed blocks in `AGENTS.md` and `CLAUDE.md` that preserve surrounding content, line endings, and formatter layout.
- Checksums over line-ending-normalized content, so line-ending conversion never causes conflicts.
- Locked, staged writes with backups and rollback; the manifest is written last, and interrupted runs complete on rerun.
- `show <item> --diff` compares installed files and blocks with the bundled version, and `--diff` on changing commands previews every planned write as a unified diff.
- Codex support with `init --agent codex`: guidelines in `AGENTS.md`, skills in `.agents/skills/`, rules converted to skills, and subagents as `.codex/agents/*.toml`. Agents can be combined and added to an existing installation.
- Global installation with `--global`: the catalog installed once for the user account, in Claude Code's and Codex's user-level directories.
- A Claude Code plugin generated from the catalog: `/plugin marketplace add zekhoi/claude`, then `/plugin install agent-kit@agent-kit`.
- Requires Node.js 22.12 or later.

### Catalog

| Item                                                                                            | Version |
| ----------------------------------------------------------------------------------------------- | ------- |
| `guideline/engineering`                                                                         | 1.0.0   |
| `rule/testing`, `rule/typescript`, `rule/python`                                                | 1.0.0   |
| `skill/code-review`, `skill/debugging`, `skill/feature-implementation`, `skill/database-design` | 1.0.0   |
| `skill/commit`, `skill/pull-request`, `skill/security-audit`                                    | 1.0.0   |
| `agent/reviewer`, `agent/debugger`                                                              | 1.0.0   |
| Presets `base`, `node`, `python`                                                                | —       |

All seven skills were evaluated with Claude Code 2.1.296 (Sonnet) against normal, edge, and negative cases; see `evals/*/results/`. The `base`, `node`, and `python` presets include `commit` and `pull-request`; `security-audit` and `database-design` are optional. The `debugging` description now also covers intermittent and production-only problems after an evaluation showed it did not trigger for them.
