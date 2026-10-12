# Contributing

## Setup

Requires Node.js >= 22.12. Use pnpm (`corepack pnpm` works without a global install).

```bash
pnpm install
pnpm -r run build
pnpm -r run test
pnpm -r run typecheck
pnpm exec eslint .
pnpm exec prettier --check .
```

The tests build the CLI and run it against temporary projects. They also validate the real `registry/`.

## Changing registry content

Registry content is installed into user projects. Write it in English, keep it concise, and respect project conventions instead of imposing a framework.

1. Edit or add files under `registry/` and declare them in `registry/index.json`. Never add `sha256` fields; the build generates checksums.
2. Bump the item `version` following the [versioning rules](PLAN.md#content-versioning): patch for wording, minor for compatible additions, major for changed invocation names, outputs, or destinations.
3. Destinations must follow the adapter's fixed layout:

   | Type        | Destination                                                         |
   | ----------- | ------------------------------------------------------------------- |
   | `guideline` | `AGENTS.md` with `"install": "managed-block"`                       |
   | `rule`      | `.claude/rules/agent-kit/<name>.md`                                 |
   | `skill`     | `.claude/skills/kit-<name>/SKILL.md` plus `references/`, `scripts/` |
   | `agent`     | `.claude/agents/kit-<name>.md`                                      |

4. Items may join presets during development, but a release must not ship a skill without recorded evaluation results.
5. Run the tests. Registry validation reports schema errors, unsafe paths, collisions, and frontmatter problems with file locations.

## Writing a skill

Build skills from concrete engineering workflows. Claude can draft them; maintainers review and evaluate them before release. Generation is an authoring workflow, not a CLI feature.

1. Define the task, when the skill should and should not be invoked, the expected output, and its boundaries (for example, "reports without editing").
2. Gather representative code, project conventions, and examples of the workflow done well.
3. Draft `registry/skills/<id>/SKILL.md` with frontmatter `name: kit-<id>` and a `description` (at most 1,536 characters) that states specific invocation conditions and when to skip it. Include actionable steps and use/skip examples. Anthropic's [`skill-creator`](https://github.com/anthropics/skills/tree/main/skills/skill-creator) can help draft and evaluate, but is not required.
4. Review the draft for accuracy, unsupported assumptions, redundant advice, and unintended actions.
5. Write evaluation cases in `evals/<id>/cases.json` (see [evals/README.md](../evals/README.md)): at least one normal, one edge, and one negative case with observable expectations.
6. Install the skill into each fixture project, run each case with Claude Code, and record the results in `evals/<id>/results/`.
7. Tighten missed checks and vague instructions, then rerun the affected cases.
8. Add the registry metadata and preset references, and commit the skill together with its evaluation record.

Keep long reference material in `references/` and tools in `scripts/`. Installing a skill never executes its scripts.

## Content checks

`pnpm build` and the tests validate the whole registry and fail on:

- schema errors, duplicate ids, unsafe or colliding destinations, and nonempty `dependencies`;
- frontmatter Claude Code needs (`name: kit-<id>`, a description, skill descriptions of at most 1,536 characters, rule `paths`);
- unfinished placeholders (`TODO`, `TBD`, `FIXME`, `XXX`, lorem ipsum, `<placeholder>`) in installed files;
- relative links that would not resolve to a file of the same item once installed;
- skill descriptions that do not say both "Use when ..." and "Do not use ...";
- reused content without complete `provenance` or with a missing notice file (see [registry/PROVENANCE.md](../registry/PROVENANCE.md)).

External links are not fetched during validation, so checks stay deterministic. Structural checks cannot tell whether a description triggers well; use the evaluation cases for that.

## Continuous integration

| Workflow            | Runs on                            | Does                                                                                                                                                                                                           |
| ------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`            | Pull requests and pushes to `main` | Workflow lint (actionlint, checksum-verified), format, lint, typecheck, build (registry validation), tests, and `scripts/verify-package.mjs`, which packs the CLI and exercises the tarball in a clean project |
| `compatibility.yml` | Pull requests and pushes to `main` | Build, tests, and package verification on Ubuntu, macOS, and Windows with Node 22.12.0, 22, and 24                                                                                                             |
| `release.yml`       | Manual dispatch only               | Release gates, approval, publishing, and a smoke test; see [releasing.md](releasing.md)                                                                                                                        |

Workflows default to read-only permissions, pin third-party actions to commit SHAs (update the SHA and the version comment together), and never receive publishing credentials on pull requests.

Agent evaluations are not part of CI: they need an agent and are nondeterministic. Record their results under `evals/` before releasing a changed skill.

## Code structure

| Path                                | Responsibility                                                    |
| ----------------------------------- | ----------------------------------------------------------------- |
| `packages/cli/src/core/planner.ts`  | Pure planning: decides create, update, adopt, or conflict         |
| `packages/cli/src/core/writer.ts`   | Applies plans: staging, backups, rename, manifest last, rollback  |
| `packages/cli/src/core/target.ts`   | Reads target files and rejects paths that escape through symlinks |
| `packages/cli/src/core/blocks.ts`   | Managed block parsing and rendering                               |
| `packages/cli/src/core/lock.ts`     | Project lock with dead-process takeover                           |
| `packages/cli/src/core/registry.ts` | Registry validation, build, and packaged loading                  |
| `packages/cli/src/adapters/`        | Claude Code destinations and format checks                        |
| `packages/cli/src/commands/`        | Command glue and output                                           |

Never weaken path validation, checksum checks, or conflict handling to make a test pass.
