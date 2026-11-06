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
- Global installation with `--global`: the catalog installed once for the user account, in Claude Code's and Codex's user-level directories. `doctor` warns when an item is installed both globally and in a project, or by another installation in the same monorepo (an enclosing project, or declared workspace packages from the root).
- A Claude Code plugin generated from the catalog: `/plugin marketplace add zekhoi/claude`, then `/plugin install agent-kit@agent-kit`.
- Hardened against hostile repositories: manifest paths are limited to what agent-kit manages, `.agent-kit` and state files must be real and small, parsing is bounded, and terminal control characters are escaped. See `SECURITY.md`.
- Requires Node.js 22.12 or later.

### Catalog

| Item                                                                                                                                               | Version |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `guideline/engineering`                                                                                                                            | 1.0.0   |
| `rule/go`, `rule/python`, `rule/typescript`                                                                                                        | 1.0.0   |
| `rule/testing`                                                                                                                                     | 1.1.0   |
| `skill/attack-surface`, `skill/ci-pipeline`, `skill/ci-triage`, `skill/code-review`, `skill/commit`, `skill/database-design`                       | 1.0.0   |
| `skill/debugging`, `skill/dependency-upgrade`, `skill/design-review`, `skill/detection-rules`, `skill/dockerfile`, `skill/documentation`           | 1.0.0   |
| `skill/drizzle-review`, `skill/fastapi-api`, `skill/fastify-api`, `skill/go-http-api`, `skill/go-review`, `skill/go-sql-review`                    | 1.0.0   |
| `skill/hardening`, `skill/incident-response`, `skill/kubernetes`, `skill/kysely-review`, `skill/monorepo-change`, `skill/monorepo-package`         | 1.0.0   |
| `skill/monorepo-release`, `skill/monorepo-review`, `skill/observability`, `skill/orchestrate`, `skill/overengineering-review`, `skill/performance` | 1.0.0   |
| `skill/prisma-review`, `skill/pull-request`, `skill/react-component`, `skill/refactoring`, `skill/release-notes`, `skill/security-audit`           | 1.0.0   |
| `skill/sqlalchemy-review`, `skill/terraform`, `skill/test-writing`, `skill/threat-model`, `skill/vuln-poc`                                         | 1.0.0   |
| `skill/feature-implementation`                                                                                                                     | 1.0.1   |
| `agent/architect`, `agent/debugger`, `agent/infra`, `agent/planner`, `agent/reviewer`                                                              | 1.0.0   |
| Presets `base`, `node`, `python`, `go`; add-ons `infra`, `monorepo`, `orchestration`, `quality`, `review`, `security`                              | —       |

- **Presets:** `base`, `node` (TypeScript, Kysely, Fastify), `python` (FastAPI, SQLAlchemy), and `go` (net/http, database/sql, Go review), plus add-ons `quality`, `review`, `security`, `infra`, `orchestration`, and `monorepo`. `database-design`, `prisma-review`, `drizzle-review`, and `react-component` are in no preset; install them with `add`.
- **Orchestration:** `kit-orchestrate` runs parallel groups that edit files in one Git worktree per subagent, created from the current commit, and applies their results as uncommitted changes.
- **Safety boundaries:** infra skills only edit files and run read-only or dry-run commands, never apply or deploy. Red-team skills work only on the user's own code and local or named test targets. `incident-response` never deletes evidence or rewrites history.
- **Evaluations:** every skill was evaluated with Claude Code 2.1.318 (Sonnet), installing the presets a user of the skill would. 117 of 132 cases pass, 13 are partial, and 2 fail: an `orchestrate` parallel case that ran without the skill, and a `refactoring` run that skipped characterization tests. Skills triggered on their own in 56 of 76 cases that do not name them, and no negative case triggered. After follow-up fixes, the `refactoring` case passes (the skill now triggers on "hard to read" requests), and one observability partial (status-class labels) and the threat-model partial pass; the Dockerfile before-and-after measurement passed in 1 of 2 runs, and hardening action pinning and observability password redaction remain partial. The five subagents were evaluated in 12 cases (Claude Code 2.1.319): 9 pass and 3 are partial. `reviewer`, `debugger`, and `infra` were delegated to whenever the task called for them, while `architect` and `planner` were used only when named. After a fix, the debugger no longer edits code when it cannot reproduce a failure. See `evals/*/results/`.
- **Choosing presets:** skills are picked less reliably as more are installed. Trigger-sensitive cases triggered in 35 of 58 runs with a project's presets and in 16 of 58 with the whole catalog. Install only the presets a project needs; see [Choose presets](README.md#choose-presets) and `evals/README.md`.
- **Known gaps:** `orchestrate`, `monorepo-change`, `monorepo-release`, and `go-http-api` are rarely picked without being named; name them, such as `/kit-orchestrate` (see the README). Likewise, ask for the `kit-architect` and `kit-planner` subagents by name. In evaluation, `dependency-upgrade` could not read upstream changelogs without network access.

### Repository

- `main` and `v*` tags are protected by GitHub rulesets (squash-only pull requests with the required checks, linear history, and no deletion or force pushes).
