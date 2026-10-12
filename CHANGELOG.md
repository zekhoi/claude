# Changelog

All notable changes to the CLI and its bundled catalog. Item versions are listed per release; see [versioning rules](docs/PLAN.md#content-versioning).

## Unreleased

First release candidate. Not yet published.

### CLI

- Commands: `list`, `show`, `init`, `add`, `status`, `update`, `remove`, `eject`, `doctor`, `uninstall`, with `--cwd`, `--json`, and `--dry-run`.
- Managed blocks in `AGENTS.md` and `CLAUDE.md` that preserve surrounding content, line endings, and formatter layout.
- Checksums over line-ending-normalized content, so line-ending conversion never causes conflicts.
- Locked, staged writes with backups and rollback; the manifest is written last, and interrupted runs complete on rerun.
- Requires Node.js 22.12 or later.

### Catalog

| Item                                                                                            | Version |
| ----------------------------------------------------------------------------------------------- | ------- |
| `guideline/engineering`                                                                         | 1.0.0   |
| `rule/testing`, `rule/typescript`, `rule/python`                                                | 1.0.0   |
| `skill/code-review`, `skill/debugging`, `skill/feature-implementation`, `skill/database-design` | 1.0.0   |
| `agent/reviewer`, `agent/debugger`                                                              | 1.0.0   |
| Presets `base`, `node`, `python`                                                                | —       |
