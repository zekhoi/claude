# Command reference

Run commands from the repository you want to configure, or pass `--cwd <path>`. Agent Kit never moves to the git root or touches other packages on its own.

```bash
npx @zekhoi/agent-kit@latest <command> [options]
```

## Common options

| Option         | Commands                                                | Meaning                                                                                                    |
| -------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--cwd <path>` | all                                                     | Target directory (default: the current directory). It must exist.                                          |
| `--json`       | all                                                     | Print exactly one JSON result on stdout; see [JSON output](#json-output).                                  |
| `--dry-run`    | `init`, `add`, `update`, `remove`, `eject`, `uninstall` | Show the plan without creating, changing, or locking anything.                                             |
| `--diff`       | `init`, `add`, `update`, `remove`, `eject`, `uninstall` | Add a unified diff of every planned write or deletion; combine with `--dry-run` to review before applying. |

## Commands

### `list`

Shows every item and preset bundled with this CLI version. Content is bundled in the package, so a newer CLI version may ship newer content.

### `show <item> [--file <destination>] [--diff]`

Prints an item's bundled files. With `--diff`, compares what the target holds (the file, or the managed block body) with the bundled version and prints a unified diff per file; files that match are reported as identical, and missing files as missing. With `--file`, prints exactly the content that would be installed at that destination, suitable for redirecting: `agent-kit show skill/code-review --file .claude/skills/kit-code-review/SKILL.md > .claude/skills/kit-code-review/SKILL.md`.

### `init [--preset <name>]... [--context]`

Installs presets. On an interactive terminal it asks which presets to install (default `base`); otherwise `--preset` is required. `--context` creates `docs/agent-context.md`, a project-owned template, and references it from the `AGENTS.md` block. Running `init` again with additional presets installs only what is new.

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

Read-only checks: malformed or missing managed blocks, a missing `CLAUDE.md` import, frontmatter that would keep Claude Code from recognizing an installed skill or agent, other project skills or agents that reuse an installed `kit-` name, local edits and missing files, leftover temporary files from interrupted runs, held locks, and items no longer in the catalog. Exits `1` when it finds an error; warnings alone exit `0`. Detection is limited to this target's `.claude/` directory and does not cover user-level or plugin skills.

### `uninstall`

Removes every managed file and block, then the manifest. Your content outside the markers, an `@AGENTS.md` import you wrote, and the project context file are kept. Files and directories the CLI created are deleted once empty. Any edited managed content cancels the whole command. Without a manifest, `uninstall` succeeds without doing anything.

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
      "action": "Keep your version with `agent-kit eject skill/code-review`, ..."
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

| Code                      | Meaning                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `UNSUPPORTED_RUNTIME`     | Node.js is older than the supported minimum.                                                                  |
| `UNSUPPORTED_SCHEMA`      | A manifest or registry was written by a newer version. Nothing is changed.                                    |
| `MANIFEST_INVALID`        | `.agent-kit/manifest.json` is unreadable. Restore it from version control.                                    |
| `TARGET_INVALID`          | The target directory does not exist or is not a directory.                                                    |
| `INPUT_REQUIRED`          | A choice is needed, for example `--preset` in a noninteractive run.                                           |
| `UNKNOWN_ITEM`            | The item or preset is not in the bundled catalog.                                                             |
| `NOT_INSTALLED`           | The item, or Agent Kit itself, is not installed in this target.                                               |
| `LOCK_HELD`               | Another Agent Kit command is running, or left a lock behind.                                                  |
| `LOCAL_EDIT_CONFLICT`     | A managed file or block was edited.                                                                           |
| `MISSING_FILE`            | A managed file was deleted.                                                                                   |
| `UNMANAGED_FILE_CONFLICT` | A file Agent Kit does not manage occupies a destination.                                                      |
| `MALFORMED_BLOCK`         | `agent-kit` markers are missing, repeated, or out of order.                                                   |
| `UNSAFE_PATH`             | A destination is a symlink, not a regular file, not UTF-8, or reached through a directory outside the target. |
| `OUTDATED_ITEM`           | An item must be updated before a shared block can change.                                                     |
| `MAJOR_UPDATE`            | A major update needs `--allow-major`.                                                                         |
| `UPDATE_AVAILABLE`        | A newer version of an installed item is bundled.                                                              |
| `ITEM_RETIRED`            | An installed item is no longer in the catalog.                                                                |
| `TARGET_CHANGED`          | A file changed while the command ran; everything was rolled back.                                             |
| `WRITE_FAILED`            | Writing failed; everything was rolled back.                                                                   |
| `IMPORT_MISSING`          | `CLAUDE.md` no longer imports `AGENTS.md`.                                                                    |
| `NAME_COLLISION`          | Another project skill or agent declares an installed `kit-` name.                                             |
| `INVALID_FRONTMATTER`     | Frontmatter that Claude Code needs is missing or wrong.                                                       |
| `CONTEXT_MISSING`         | The referenced project context file is missing.                                                               |
| `LEFTOVER_FILE`           | A temporary file from an interrupted run remains.                                                             |
| `CHECKSUM_MISMATCH`       | A bundled file does not match its checksum. Reinstall the CLI.                                                |

Registry validation codes (`SCHEMA_INVALID`, `DUPLICATE_ID`, `ID_TYPE_MISMATCH`, `MISSING_SOURCE`, `INVALID_ENCODING`, `DESTINATION_NOT_ALLOWED`, `DESTINATION_COLLISION`, `UNSUPPORTED_DEPENDENCIES`, `UNKNOWN_PRESET_ITEM`, `PLACEHOLDER`, `BROKEN_REFERENCE`, `TRIGGER_UNCLEAR`) are reported when building the catalog and are covered in [contributing.md](contributing.md).
