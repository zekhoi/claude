# Agent Kit

A CLI that installs engineering guidelines, rules, subagents, and skills for Claude Code and Codex into a repository.

> Status: preparing the first release, `@zekhoi/agent-kit` 0.1.0. It is not published yet.
> See [docs/PLAN.md](docs/PLAN.md) for the design and roadmap, and [SECURITY.md](SECURITY.md) for the threat model and how to report vulnerabilities.

## Choose presets

Install only the presets a project needs. Every installed skill competes for the agent's attention: in evaluations, skills were picked far more often with a project's presets installed than with the whole catalog (see [evals/README.md](evals/README.md#triggering-and-catalog-size)). The `node`, `python`, and `go` presets include `base`; add-ons don't, so for other stacks pass `--preset base` with them.

| Project                                         | Command                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node.js or TypeScript service                   | `agent-kit init --preset node` (then `add skill/prisma-review`, `skill/drizzle-review`, or `skill/react-component` if used) |
| Python service                                  | `agent-kit init --preset python`                                                                                            |
| Go service                                      | `agent-kit init --preset go`                                                                                                |
| Other languages                                 | `agent-kit init --preset base`                                                                                              |
| Monorepo or workspace                           | add `--preset monorepo` to the stack preset                                                                                 |
| Security work                                   | add `--preset security`                                                                                                     |
| Infrastructure as code, containers, CI          | add `--preset infra`                                                                                                        |
| Larger tasks split across subagents             | add `--preset orchestration`                                                                                                |
| Refactoring, tests, docs, performance, upgrades | add `--preset quality`                                                                                                      |
| Design and over-engineering reviews             | add `--preset review`                                                                                                       |

See [docs/cli.md](docs/cli.md#init---preset-name---agent-name---context) for each preset's contents.

## Development

Requires Node.js >= 22.12 and pnpm (pinned through `packageManager`; `corepack pnpm` works without a global install).

```bash
pnpm install
pnpm build        # compile the CLI and bundle the registry with checksums
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Try the built CLI against another project:

```bash
node packages/cli/dist/index.js list
node packages/cli/dist/index.js init --preset node --context --dry-run --cwd ../some-project
node packages/cli/dist/index.js add agent/reviewer --cwd ../some-project
node packages/cli/dist/index.js show skill/code-review
```

Commands: `list`, `show`, `init`, `add`, `status`, `update`, `remove`, `eject`, `doctor`, and `uninstall`. All accept `--cwd` and `--json`; commands that change files accept `--dry-run`. See [docs/customization.md](docs/customization.md) for how local edits and conflicts are handled. Exit codes: `0` success, `1` error, `2` conflict requiring user action.

## Layout

| Path                          | Contents                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli/`               | The CLI: commands, core planning and validation, and the Claude adapter                                                                                                                                      |
| `registry/`                   | Content installed into user projects: guidelines, rules, agents, skills, presets, templates                                                                                                                  |
| `evals/`                      | Authoring evaluations for skills (not installed)                                                                                                                                                             |
| `docs/`                       | [Plan](docs/PLAN.md), [command reference](docs/cli.md), [customization](docs/customization.md), [compatibility](docs/compatibility.md), [contributing](docs/contributing.md), [releasing](docs/releasing.md) |
| `plugins/`, `.claude-plugin/` | Claude Code plugin and marketplace, generated from `registry/` by `pnpm build:plugin`                                                                                                                        |
| `scripts/`                    | Package verification and release checks used by CI                                                                                                                                                           |
