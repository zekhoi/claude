# Customizing installed content

Agent Kit copies files into your project. You own your repository: you can edit anything it installs, and your edits always win. This page explains what Agent Kit tracks, what it never touches, and how to resolve conflicts.

## Ownership

| Content                                                                                             | Owner                              | What Agent Kit does                                              |
| --------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| Files under `.claude/skills/kit-*`, `.claude/agents/kit-*`, `.claude/rules/agent-kit/`              | Agent Kit, until you edit them     | Updates and removes them only while they match what it installed |
| Text between `<!-- agent-kit:start -->` and `<!-- agent-kit:end -->` in `AGENTS.md` and `CLAUDE.md` | Agent Kit, until you edit it       | Same as above                                                    |
| Everything outside those markers                                                                    | You                                | Never modified                                                   |
| An `@AGENTS.md` import you wrote yourself in `CLAUDE.md`                                            | You                                | Never modified or removed                                        |
| `docs/agent-context.md`                                                                             | You, from the moment it is created | Never updated or removed                                         |
| `.agent-kit/manifest.json`                                                                          | Agent Kit                          | Bookkeeping; commit it, do not edit it                           |

Agent Kit compares content after normalizing line endings, so a checkout with Windows line endings or a Markdown formatter adjusting blank lines inside the markers is not treated as an edit.

## When you edit an installed file

`agent-kit status` and `agent-kit doctor` show the file as modified. From then on:

- `agent-kit update` (no arguments) skips that item, updates everything else, lists the skipped item, and exits with code `2`.
- `agent-kit update <item>`, `remove <item>`, and `uninstall` stop without changing anything.

To see exactly what differs, run `agent-kit show <item> --diff`. To preview what an update or removal would write, add `--dry-run --diff`.

Choose one of the following.

| Situation                                                 | Keep your version                                                                                                                   | Take the bundled version                                                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| You edited a managed file                                 | `agent-kit eject <item>`: the files stay exactly as they are and are no longer managed                                              | Compare with `agent-kit show <item> --diff`, restore it (for example `agent-kit show <item> --file <path> > <path>`, or `git checkout -- <path>`), then rerun |
| You deleted a managed file                                | `agent-kit eject <item>`, or `agent-kit remove <item>` (a missing file counts as removed)                                           | Restore it with `agent-kit show <item> --file <path> > <path>`, then rerun                                                                                    |
| You edited inside the managed block                       | Move your text outside the markers, then rerun; or `agent-kit eject guideline/engineering` to keep the whole block as your own text | Revert the edits between the markers (`git checkout -- AGENTS.md`), then rerun                                                                                |
| A file you own occupies a path Agent Kit wants to install | Rename or move your file, then rerun                                                                                                | Replace it with `agent-kit show <item> --file <path> > <path>`; identical content is adopted automatically                                                    |

`eject` on the guidelines removes only the marker lines: the guideline text and project context reference remain in `AGENTS.md`, and the `@AGENTS.md` import remains in `CLAUDE.md`, all as your own content.

## Major updates

A major item version can change how a skill is invoked or what it produces. `agent-kit update` never applies a major update on its own; it reports it instead. Review the changelog, then run `agent-kit update <item> --allow-major`.

## Your own variants

To keep a substantially different workflow, create your own skill or agent outside Agent Kit with a unique name and a description that does not overlap with the `kit-` items, or eject the item and rename it. Agent Kit never renames or merges skills for you. `agent-kit doctor` reports project skills and agents that reuse an installed `kit-` name.

## Interrupted commands

If a command is interrupted (for example the terminal is closed), rerun the same command. Agent Kit writes its manifest last, so the manifest never claims changes that did not happen, and a rerun completes the work. If `doctor` reports `LEFTOVER_FILE` entries afterwards, delete them. You can always restore the previous state from version control.
