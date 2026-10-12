# agent-kit

Install engineering guidelines, rules, subagents, and skills for [Claude Code](https://code.claude.com/docs) into a repository with one command, then keep them up to date without losing your own edits.

> Status: pre-release. The package name is a placeholder until the first published version.

```bash
# From the root of the repository to set up
npx @yourname/agent-kit@latest init --preset node
```

This writes plain files you can review and commit:

- `AGENTS.md` and `CLAUDE.md`: core guidelines in a marked block; your own content is never touched.
- `.claude/skills/kit-*`, `.claude/agents/kit-*`, `.claude/rules/agent-kit/`: skills, subagents, and rules.
- `.agent-kit/manifest.json`: what was installed, so updates can detect your local edits.

It does not launch Claude, need an API key, or change `.claude/settings.json`.

## Commands

| Command                                 | Purpose                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `list`                                  | Show the bundled catalog                                                             |
| `show <item> [--file <path>]`           | Print an item's bundled content                                                      |
| `init [--preset <name>]... [--context]` | Install presets (`base`, `node`, `python`) and optionally a project context template |
| `add <item or preset>...`               | Install more items                                                                   |
| `status`                                | Show installed items, local edits, and available updates                             |
| `update [item]... [--allow-major]`      | Update items you have not edited                                                     |
| `remove <item>...`                      | Delete unedited items                                                                |
| `eject <item>...`                       | Keep an item's files as your own and stop managing them                              |
| `doctor`                                | Check the installation without changing anything                                     |
| `uninstall`                             | Remove everything agent-kit manages                                                  |

Every command accepts `--cwd <path>` and `--json`; commands that change files accept `--dry-run`. Exit codes: `0` success, `1` error, `2` conflict that needs your decision.

Requires Node.js 22.12 or later.
