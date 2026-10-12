# Agent Kit

A CLI that installs engineering guidelines, rules, subagents, and skills for Claude Code into a repository.

> Status: in development. The package is not published and `@yourname/agent-kit` is a placeholder name.
> See [docs/PLAN.md](docs/PLAN.md) for the design and roadmap.

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

| Path            | Contents                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli/` | The CLI: commands, core planning and validation, and the Claude adapter                                                                                                                                      |
| `registry/`     | Content installed into user projects: guidelines, rules, agents, skills, presets, templates                                                                                                                  |
| `evals/`        | Authoring evaluations for skills (not installed)                                                                                                                                                             |
| `docs/`         | [Plan](docs/PLAN.md), [command reference](docs/cli.md), [customization](docs/customization.md), [compatibility](docs/compatibility.md), [contributing](docs/contributing.md), [releasing](docs/releasing.md) |
| `scripts/`      | Package verification and release checks used by CI                                                                                                                                                           |
