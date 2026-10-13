# Command reference

Run commands from the repository you want to configure, or pass `--cwd <path>`. Agent Kit never moves to the git root or touches other packages on its own.

```bash
npx @zekhoi/agent-kit@latest <command> [options]
```

## Common options

| Option         | Commands                                                | Meaning                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--cwd <path>` | all                                                     | Target directory (default: the current directory). It must exist.                                                                                                                               |
| `--global`     | all except `list`                                       | Operate on the user-level installation in your home directory, which applies to every project. Cannot be combined with `--cwd` or `--context`. See [Global installation](#global-installation). |
| `--json`       | all                                                     | Print exactly one JSON result on stdout; see [JSON output](#json-output).                                                                                                                       |
| `--dry-run`    | `init`, `add`, `update`, `remove`, `eject`, `uninstall` | Show the plan without creating, changing, or locking anything.                                                                                                                                  |
| `--diff`       | `init`, `add`, `update`, `remove`, `eject`, `uninstall` | Add a unified diff of every planned write or deletion; combine with `--dry-run` to review before applying.                                                                                      |

## Commands

### `list`

Shows every item and preset bundled with this CLI version. Content is bundled in the package, so a newer CLI version may ship newer content.

### `show <item> [--file <destination>] [--diff]`

Prints an item's bundled files. With `--diff`, compares what the target holds (the file, or the managed block body) with the bundled version and prints a unified diff per file; files that match are reported as identical, and missing files as missing. With `--file`, prints exactly the content that would be installed at that destination, suitable for redirecting: `agent-kit show skill/code-review --file .claude/skills/kit-code-review/SKILL.md > .claude/skills/kit-code-review/SKILL.md`.

### `init [--preset <name>]... [--agent <name>]... [--context]`

Installs one or more presets for one or more coding agents: `--agent claude` (the default) and `--agent codex`. On an interactive terminal it asks which presets to install (default `base`); otherwise, including with `--json`, `--preset` is required. Running `init` again with additional presets installs only what is new.

| Preset    | Contents                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `base`    | Engineering guidelines; `code-review`, `debugging`, `feature-implementation`, `commit`, and `pull-request` skills; testing rules |
| `node`    | `base` plus TypeScript rules and the `kysely-review` and `fastify-api` skills                                                    |
| `python`  | `base` plus Python rules                                                                                                         |
| `quality` | Add-on: `refactoring`, `test-writing`, and `documentation` skills                                                                |
| `review`  | Add-on: `security-audit` skill and the read-only `reviewer` subagent                                                             |

Presets combine, so add-ons go with a stack preset: `agent-kit init --preset node --preset quality`. `database-design` and the `debugger` subagent are in no preset; install them with `add`. `agent-kit list` shows the bundled catalog.

`--context` creates `docs/agent-context.md`, a project-owned template, and references it from the `AGENTS.md` block. Run `init --agent <name>` on an existing installation to add an agent; every installed item gets that agent's files, and no preset is needed. See [compatibility.md](compatibility.md#codex) for where Codex files go.

### `add <item or preset>...`

Installs items (`skill/debugging`) or every item of a preset (`preset/python`). Already installed items are left as they are; if a newer version is bundled, `add` says so.

### `status`

Read-only summary: each installed item with its version and file states (`ok`, `modified`, `missing`, `unsafe`), available updates, managed blocks, the `CLAUDE.md` import, the project context file, and preset items that are not installed. A held lock is reported as a warning.

### `update [item]... [--allow-major]`

Updates installed items to the bundled versions. Unmodified files are replaced, files a new version adds are created, and files it no longer ships are deleted only if unmodified.

- With no items, every installed item is considered. An item with a conflict (an edited or deleted file, an edited block) is skipped as a whole; the others are applied and the command exits with `2`.
- With items named, any conflict cancels the whole command.
- Major updates are never applied without `--allow-major`: without arguments they are reported as warnings, and naming an item without the flag is a conflict.

### `remove <item>...`

Deletes the items' files if they are unmodified, removes their now-empty directories, and updates the managed blocks. A file that is already missing counts as removed.

### `eject <item>...`

Stops managing items and leaves their files exactly as they are, edited or not. Ejecting `guideline/engineering` removes only the marker lines around its block, keeping the text.

### `doctor`

Read-only checks: malformed or missing managed blocks, a missing `CLAUDE.md` import, frontmatter or TOML that would keep Claude Code or Codex from recognizing an installed skill or agent, other project skills or agents (in `.claude/skills`, `.claude/agents`, `.agents/skills`, and `.codex/agents`) that reuse an installed `kit-` name, local edits and missing files, leftover temporary files from interrupted runs, held locks, items no longer in the catalog, and items also installed globally or by another installation in the same monorepo: an enclosing project up to the git root, or, at a monorepo root, the workspace packages declared in `pnpm-workspace.yaml` or `package.json` `workspaces`. Other directories are not scanned. Exits `1` when it finds an error; warnings alone exit `0`. Name-collision checks do not cover user-level or plugin skills.

### `uninstall`

Removes every managed file and block, then the manifest. Your content outside the markers, an `@AGENTS.md` import you wrote, and the project context file are kept. Files and directories the CLI created are deleted once empty. Any edited managed content cancels the whole command. Without a manifest, `uninstall` succeeds without doing anything.

## Global installation

`--global` installs once for your user account instead of per repository. Every command except `list` accepts it, and a global installation keeps its own manifest in `~/.agent-kit/`. Commands refuse to mix scopes (`SCOPE_MISMATCH`), so a project installation and a global one are never confused.

| Item       | Claude Code                            | Codex                                                       |
| ---------- | -------------------------------------- | ----------------------------------------------------------- |
| Guidelines | Managed block in `~/.claude/CLAUDE.md` | Managed block in `~/.codex/AGENTS.md`                       |
| Skills     | `~/.claude/skills/kit-<name>/`         | `~/.agents/skills/kit-<name>/`                              |
| Rules      | `~/.claude/rules/agent-kit/`           | `~/.agents/skills/kit-<name>-rules/`                        |
| Subagents  | `~/.claude/agents/kit-<name>.md`       | `~/.codex/agents/kit-<name>.toml` (no project trust needed) |

Project context templates and the `CLAUDE.md` import are project-only. If `CLAUDE_CONFIG_DIR` or `CODEX_HOME` moves an agent's directory away from your home directory, global installation for that agent is refused rather than writing to the wrong place.

When an item is installed both globally and in a project, Claude Code prefers the **user-level skill** but the **project subagent**, and loads both copies of rules and guidelines. Install each item in only one scope; `agent-kit doctor` in a project reports overlapping items (`SCOPE_OVERLAP`).

## Exit codes

| Code | Meaning                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success, including no-op runs. Warnings may be present.                                                                          |
| `1`  | Error: invalid input, unsupported runtime or schema, unreadable target, or a failed write (rolled back).                         |
| `2`  | Conflict that needs your decision; see [customization.md](customization.md). For no-argument `update`, other items were applied. |

`--dry-run` exits with the code the real run would produce.

## JSON output

With `--json`, stdout contains one object and nothing else; prompts are disabled.

```json
{
  "outputSchemaVersion": 1,
  "command": "update",
  "status": "conflict",
  "target": "/path/to/project",
  "data": {
    "dryRun": false,
    "applied": true,
    "changes": [
      {
        "action": "update",
        "destination": ".claude/skills/kit-debugging/SKILL.md",
        "kind": "file",
        "itemId": "skill/debugging",
        "fromVersion": "1.0.0",
        "toVersion": "1.1.0"
      }
    ]
  },
  "diagnostics": [
    {
      "code": "LOCAL_EDIT_CONFLICT",
      "severity": "conflict",
      "message": "the file was edited locally",
      "path": ".claude/skills/kit-code-review/SKILL.md",
      "action": "Compare with `agent-kit show skill/code-review --diff`; keep your version with `agent-kit eject skill/code-review`, ..."
    }
  ]
}
```

- `status` is `ok`, `error`, or `conflict`, matching exit codes `0`, `1`, and `2`.
- `changes[].action` is one of `create`, `update`, `delete`, `unchanged`, `adopt` (an existing identical file or block is taken over), `release` (no longer managed), or `conflict`.
- `changes[].kind` is `file`, `managed-block`, or `context`.
- `changes[].diff` holds a unified diff when `--diff` was passed.
- `data` for `list`, `show`, `status`, and `doctor` is command-specific; see `--json` output for its shape.
- Fields may be added in later versions; existing fields change only with a new `outputSchemaVersion`.

## Diagnostic codes

| Code                      | Meaning                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UNSUPPORTED_RUNTIME`     | Node.js is older than the supported minimum.                                                                                                                 |
| `UNSUPPORTED_SCHEMA`      | A manifest or registry was written by a newer version. Nothing is changed.                                                                                   |
| `MANIFEST_INVALID`        | `.agent-kit/manifest.json` is unreadable. Restore it from version control.                                                                                   |
| `TARGET_INVALID`          | The target directory does not exist or is not a directory.                                                                                                   |
| `SCOPE_MISMATCH`          | The command's scope (`--global` or not) does not match the installation it found.                                                                            |
| `SCOPE_OVERLAP`           | An item is also installed globally or by another installation in the same monorepo; the warning explains which copy an agent uses, where that is documented. |
| `INPUT_REQUIRED`          | A choice is needed, for example `--preset` in a noninteractive run.                                                                                          |
| `UNKNOWN_ITEM`            | The item or preset is not in the bundled catalog.                                                                                                            |
| `NOT_INSTALLED`           | The item, or Agent Kit itself, is not installed in this target.                                                                                              |
| `LOCK_HELD`               | Another Agent Kit command is running, or left a lock behind.                                                                                                 |
| `LOCAL_EDIT_CONFLICT`     | A managed file or block was edited.                                                                                                                          |
| `MISSING_FILE`            | A managed file was deleted.                                                                                                                                  |
| `UNMANAGED_FILE_CONFLICT` | A file Agent Kit does not manage occupies a destination.                                                                                                     |
| `MALFORMED_BLOCK`         | `agent-kit` markers are missing, repeated, or out of order.                                                                                                  |
| `UNSAFE_PATH`             | A destination is a symlink, not a regular file, not UTF-8, or reached through a directory outside the target.                                                |
| `OUTDATED_ITEM`           | An item must be updated before a shared block can change.                                                                                                    |
| `MAJOR_UPDATE`            | A major update needs `--allow-major`.                                                                                                                        |
| `UPDATE_AVAILABLE`        | A newer version of an installed item is bundled.                                                                                                             |
| `ITEM_RETIRED`            | An installed item is no longer in the catalog.                                                                                                               |
| `TARGET_CHANGED`          | A file changed while the command ran; everything was rolled back.                                                                                            |
| `WRITE_FAILED`            | Writing failed; everything was rolled back.                                                                                                                  |
| `IMPORT_MISSING`          | `CLAUDE.md` no longer imports `AGENTS.md`.                                                                                                                   |
| `NAME_COLLISION`          | Another project skill or agent declares an installed `kit-` name.                                                                                            |
| `INVALID_FRONTMATTER`     | Frontmatter that Claude Code needs is missing or wrong.                                                                                                      |
| `CONTEXT_MISSING`         | The referenced project context file is missing.                                                                                                              |
| `LEFTOVER_FILE`           | A temporary file from an interrupted run remains.                                                                                                            |
| `CHECKSUM_MISMATCH`       | A bundled file does not match its checksum. Reinstall the CLI.                                                                                               |

Registry validation codes (`SCHEMA_INVALID`, `DUPLICATE_ID`, `ID_TYPE_MISMATCH`, `MISSING_SOURCE`, `INVALID_ENCODING`, `DESTINATION_NOT_ALLOWED`, `DESTINATION_COLLISION`, `UNSUPPORTED_DEPENDENCIES`, `UNKNOWN_PRESET_ITEM`, `PLACEHOLDER`, `BROKEN_REFERENCE`, `TRIGGER_UNCLEAR`) are reported when building the catalog and are covered in [contributing.md](contributing.md).
