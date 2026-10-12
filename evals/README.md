# Skill evaluations

Authoring evaluations for registry skills. Nothing in this directory is installed into user projects.

Schema validation and unit tests run in CI. Agent evaluations run separately because they need an agent, cost money, and are nondeterministic. A skill is not considered evaluated because its files pass schema validation.

## Layout

```text
evals/<skill-id>/
├── cases.json        # case definitions (format below)
├── fixtures/         # small sample projects or files referenced by cases
└── results/
    └── <YYYY-MM-DD>-<skill-version>.md   # one record per evaluation run
```

`<skill-id>` is the item name without the type prefix, for example `code-review` for `skill/code-review`.

## Case format

`cases.json` contains at least one `normal`, one `edge`, and one `negative` case.

```json
{
  "skill": "skill/code-review",
  "cases": [
    {
      "id": "flags-missing-null-check",
      "kind": "normal",
      "fixture": "fixtures/null-deref",
      "prompt": "Review the changes in src/user.ts",
      "expectations": [
        "Identifies the unchecked null return from findUser in src/user.ts",
        "Reports the finding with a severity and a file:line location",
        "Does not edit any file"
      ]
    },
    {
      "id": "unrelated-request",
      "kind": "negative",
      "fixture": "fixtures/null-deref",
      "prompt": "Rename the User type to Account",
      "expectations": ["Does not invoke /kit-code-review"]
    }
  ]
}
```

| Field          | Meaning                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | Kebab-case, unique within the file.                                                                                                        |
| `kind`         | `normal` (typical task), `edge` (unusual input or boundary), or `negative` (must not trigger the skill or must refuse a forbidden action). |
| `fixture`      | Path relative to the skill's eval directory, or a pinned external reference. Optional for negative cases.                                  |
| `prompt`       | What the user says to the agent.                                                                                                           |
| `expectations` | Observable outcomes judged by a reviewer. Describe behavior, not exact wording.                                                            |
| `history`      | Optional commit messages created on `main` after the initial commit, for example to establish a message convention.                        |
| `branch`       | Optional `{ "name", "commits": [{ "message", "files" }] }` checked out with real commits, for branch-based skills.                         |
| `changes`      | Optional `{ path: content }` written after setup and left uncommitted; add `"staged": true` to stage them.                                 |
| `allowedTools` | Optional extra Claude Code tool permissions for the case, such as `Bash(git commit*)`.                                                     |

## Running cases

`node evals/run.mjs` runs every case with Claude Code and writes one JSON transcript summary per case: skills invoked, tool calls, files changed, the diff, the fixture's tests afterwards, the final answer, and cost. Build the CLI first (`pnpm -r run build`). Options: `--skill <id>`, `--case <id>`, `--model <model>` (default `sonnet`), `--budget <usd>` per case (default 1), and `--out <dir>`.

Each case runs in a fresh git repository containing the fixture, with the guidelines and every skill installed by the CLI, so negative cases test real triggering. Sessions load only the project's configuration. Judging the expectations remains a review step: read the summaries and record the outcome.

## Result records

Each run is a Markdown file under `results/` recording:

- Skill id and item version, and the evaluated commit.
- Agent and model used, and the environment (OS, Claude Code version).
- Date of the run.
- For each case: pass or fail per expectation, with a short note on any failure.
- Changes made to the skill as a result, if any.

Rerun the affected cases whenever a skill's instructions or supporting files change, and before releasing a changed skill.
