# agent-kit

Install engineering guidelines, rules, subagents, and skills for [Claude Code](https://code.claude.com/docs) and [Codex](https://learn.chatgpt.com/docs) into a repository with one command, then keep them up to date without losing your own edits.

```bash
# From the root of the repository to set up
npx @zekhoi/agent-kit@latest init --preset node

# For Codex, or for both agents
npx @zekhoi/agent-kit@latest init --preset node --agent codex
npx @zekhoi/agent-kit@latest init --preset node --agent claude --agent codex
```

This writes plain files you can review and commit:

- `AGENTS.md` and `CLAUDE.md`: core guidelines in a marked block; your own content is never touched.
- `.claude/skills/kit-*`, `.claude/agents/kit-*`, `.claude/rules/agent-kit/`: skills, subagents, and rules for Claude Code.
- `.agents/skills/kit-*` and `.codex/agents/kit-*.toml`: the same for Codex (rules become skills, since Codex has no path-scoped rules; project subagents load once you trust the project in Codex).
- `.agent-kit/manifest.json`: what was installed, so updates can detect your local edits.

It does not launch any agent, need an API key, or change agent settings such as `.claude/settings.json` or `.codex/config.toml`.

## Commands

| Command                                                     | Purpose                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `list`                                                      | Show the bundled catalog                                                                                          |
| `show <item> [--file <path>]`                               | Print an item's bundled content                                                                                   |
| `init [--preset <name>]... [--agent <name>]... [--context]` | Install presets (`base`, `node`, `python`) for `claude` and/or `codex`, and optionally a project context template |
| `add <item or preset>...`                                   | Install more items                                                                                                |
| `status`                                                    | Show installed items, local edits, and available updates                                                          |
| `update [item]... [--allow-major]`                          | Update items you have not edited                                                                                  |
| `remove <item>...`                                          | Delete unedited items                                                                                             |
| `eject <item>...`                                           | Keep an item's files as your own and stop managing them                                                           |
| `doctor`                                                    | Check the installation without changing anything                                                                  |
| `uninstall`                                                 | Remove everything agent-kit manages                                                                               |

Every command accepts `--cwd <path>` and `--json`; commands that change files accept `--dry-run`. Exit codes: `0` success, `1` error, `2` conflict that needs your decision.

Requires Node.js 22.12 or later.
