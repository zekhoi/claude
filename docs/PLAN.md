# Agent Kit — Implementation Plan

Status: Phases 1–2 complete except running the initial skill evaluations; Phase 3 not started.

## 1. Goal

Build a repository containing engineering guidelines, rules, agents, and skills that can be installed into other repositories with one `npx` command.

The primary target is Claude Code. `AGENTS.md` provides shared instructions for other agents; additional installation adapters will follow once the Claude integration is stable.

Working name: `agent-kit`. Example package name: `@yourname/agent-kit`. All commands in this document describe the proposed CLI, which is not yet available as a published package.

### Release scope

Phases 1–4 define the initial public release. Phase 5 is future work and does not block that release.

| Initial release | Deferred |
| --- | --- |
| Claude Code project adapter; copied, bundled content | Other adapters, global installation, remote registry, plugin distribution |
| `init`, `add`, `list`, `show`, `status`, `update`, `remove`, `eject`, `doctor`, `uninstall` | Automatic merging, force overwrite, interactive conflict resolution |
| Managed blocks, line-ending-normalized checksums, project lock, staged writes with manifest-last commit, safe removal | Rich side-by-side diff interface; transaction journal and `recover` |
| Current directory or `--cwd` target only | Monorepo overlap scanning, item dependency resolution, upgrade migration framework |
| Base/Node/Python presets and evaluated initial catalog | Fastify, Kysely, and other specialist skills until independently evaluated |
| Optional project context template, authoring evaluations, GitHub Actions | Automatic context generation or skill generation inside the CLI |

`--dry-run` initially shows a change summary with paths, reasons, and version transitions, not full content diffs. Maintainers can compare files manually until a diff interface is implemented.

### Decisions before release

Keep `agent-kit` and `@yourname/agent-kit` as placeholders until the owner selects an available repository name and npm scope. Do not claim name availability or configure publishing against these placeholders.

During foundation work, select and record Node and Claude Code version ranges using current official documentation and verification; current values and verified format assumptions are in `docs/compatibility.md`. These unresolved values block publication, not local development. Select the publisher account and publishing mechanism during release preparation.

## 2. User experience

```bash
# Run from the target repository root
npx @yourname/agent-kit@latest init

# Add individual components
npx @yourname/agent-kit@latest add skill/code-review
npx @yourname/agent-kit@latest add agent/debugger
npx @yourname/agent-kit@latest add rule/typescript

# Inspect the catalog and installation status
npx @yourname/agent-kit@latest list
npx @yourname/agent-kit@latest status

# Preview and apply updates
npx @yourname/agent-kit@latest update --dry-run
npx @yourname/agent-kit@latest update
```

Installation produces local files that Claude can read and users can commit with their projects. The CLI does not launch Claude, request API keys, or require a backend application.

## 3. Architecture decisions

| Area | Decision |
| --- | --- |
| Language | TypeScript with Node.js |
| Development package manager | pnpm |
| Distribution | npm package with an executable defined through the `bin` field |
| Build | Compile to JavaScript; users do not need TypeScript |
| Initial registry | Content bundled in the npm package |
| Future registry | Optional remote registry with immutable versions |
| Installation | Copy files rather than use symlinks or git submodules |
| Initial platform | Claude Code, project scope |
| Shared instructions | `AGENTS.md`, imported through `CLAUDE.md` |
| Updates | Installation manifest, checksums, and local change detection |
| Testing | Core unit tests and CLI integration tests in temporary projects |

Bundle the registry initially so each package version produces consistent content without additional hosting. Content changes will therefore require a new package release. Introduce a remote registry later if the catalog needs updates independent of the CLI.

## 4. Repository structure

```text
agent-kit/
├── package.json
├── pnpm-workspace.yaml
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── packages/
│   └── cli/
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── commands/
│       │   ├── core/
│       │   └── adapters/claude.ts
│       └── tests/
├── registry/
│   ├── index.json
│   ├── guidelines/
│   ├── templates/
│   ├── rules/
│   ├── agents/
│   ├── skills/
│   └── presets/
├── evals/
│   └── <skill-id>/
├── docs/
│   ├── PLAN.md
│   ├── compatibility.md
│   ├── cli.md
│   ├── registry.md
│   └── contributing.md
└── .github/workflows/
```

Root `AGENTS.md` and `CLAUDE.md` files govern development of this repository itself. Content installed into user projects lives in `registry/` to prevent accidentally distributing internal instructions. Install the root managed blocks through the CLI itself once `init` works, so this repository dogfoods its own installation path; repository-specific instructions stay outside the managed blocks.

The build includes the CLI, registry, and templates in the npm tarball. Use `npm pack` to verify the distribution.

## 5. Installed project structure

```text
target-project/
├── AGENTS.md
├── CLAUDE.md
├── .agent-kit/
│   └── manifest.json
└── .claude/
    ├── rules/agent-kit/
    ├── agents/kit-reviewer.md
    └── skills/kit-code-review/
        └── SKILL.md
```

- `AGENTS.md` receives a managed block containing concise core guidelines.
- `CLAUDE.md` receives a managed block with `@AGENTS.md` if that import is absent. If it already exists outside the block, preserve it without adding a duplicate. Record that import as user-owned in the manifest so the CLI does not remove it.
- `.claude/rules/agent-kit/` contains rules; language rules use appropriate path frontmatter.
- `.claude/agents/` contains subagents with names prefixed by `kit-`.
- `.claude/skills/` contains skills with names prefixed by `kit-` to reduce collisions with built-in or project skills.

Rules are namespaced by directory because their file names are not invocation names. Agents and skills are invoked by name, so they are namespaced by the `kit-` prefix instead. Agent and skill names must be clearly distinct from each other (for example, the `kit-reviewer` agent and the `kit-code-review` skill).

For root instruction files, the CLI only modifies blocks delimited by `<!-- agent-kit:start -->` and `<!-- agent-kit:end -->`. Preserve all content outside those blocks. Treat incomplete or repeated markers as conflicts rather than repairing them automatically. Write a blank line inside each marker and ignore blank lines at the edges of a block body, so Markdown formatters such as Prettier do not cause conflicts.

Do not create or modify `.claude/settings.json` by default. Permissions, hooks, and MCP configuration are outside the initial scope.

## 6. Registry contract

Each item has the following metadata:

```json
{
  "schemaVersion": 1,
  "id": "skill/code-review",
  "version": "1.0.0",
  "type": "skill",
  "description": "Review changes for correctness and security",
  "dependencies": [],
  "files": [
    {
      "source": "skills/code-review/SKILL.md",
      "destination": ".claude/skills/kit-code-review/SKILL.md"
    }
  ]
}
```

Source metadata never contains checksums. The build computes a `sha256` for each file over line-ending-normalized content and writes it into the packaged index; maintainers never edit hashes by hand. The validator checks schemas, unique IDs, file references, and destination collisions in source, and verifies the packaged index hashes against the packaged files.

`dependencies` is reserved for future use. The initial release requires it to be empty, because the initial catalog consists of independent Markdown items; dependency resolution, cycle detection, and dependent-blocking removal are deferred until an item genuinely needs another. The adapter validates the destination paths declared by registry items against a fixed allowlist. A future adapter may supply its own mapping; the initial registry destinations are Claude-specific.

Presets reference collections of items instead of duplicating content. Initial presets: `base`, `node`, and `python`. `init` installs `base`; users can explicitly select additional presets.

## 7. Initial catalog

| Type | Initial items | Purpose |
| --- | --- | --- |
| Guidelines | engineering | Inspect projects, follow conventions, implement, verify, and report |
| Rules | typescript, python, testing | Conventions scoped to relevant files or contexts |
| Skills | code-review | Evidence-based findings with severity and file locations |
| Skills | debugging | Reproduction, diagnosis, fixes, and verification |
| Skills | feature-implementation | Trace requirements through implementation and validation |
| Skills | database-design | Relationships, constraints, indexes, and migrations |
| Agents | reviewer, debugger | Subagents with clear responsibilities and tool scope |

Content authoring guidelines:

- Keep core instructions concise; put longer procedures in skills.
- Use `name` and `description` fields that clearly explain when to invoke each skill.
- Move lengthy references out of `SKILL.md` when appropriate.
- Respect project conventions without imposing a framework.
- Code reviews report findings without editing code unless requested.
- Inspect code before making assumptions and run relevant verification.
- Deployments, messages, and production changes require appropriate user instructions.
- Write all distributed guidelines, rules, agents, skills, templates, and documentation in English.

### Custom skill generation workflow

Build original skills from concrete engineering workflows. Claude can draft the files; maintainers review and evaluate them before adding them to the distributed registry. Generation is an authoring workflow, not a CLI feature in the initial release.

1. Define the task, invocation conditions, expected output, and boundaries.
2. Gather representative code, project conventions, and examples of successful execution.
3. Ask Claude to generate `registry/skills/<skill-id>/SKILL.md` in English with YAML frontmatter, actionable steps, and examples of when to use or skip the skill.
4. Review the draft for accuracy, unsupported assumptions, redundant advice, and unintended actions.
5. Copy the skill into `.claude/skills/kit-<skill-id>/` in a test project and invoke `/kit-<skill-id>`.
6. Evaluate representative cases: a normal task, an edge case, and an unrelated request that should not trigger the skill. Compare results against explicit expectations.
7. Refine missed checks and vague instructions, then repeat the affected evaluations.
8. Validate frontmatter and supporting files, add registry metadata and preset references, and commit the reviewed skill.

The installed folder name and frontmatter `name` must both use `kit-<skill-id>`. Keep optional supporting material in `references/` and reusable tools in `scripts/`. Installing a skill must not execute its scripts.

Example authoring prompt:

```text
Create a Claude Code skill for reviewing Kysely queries.

Output: registry/skills/kysely-review/SKILL.md
Language: English
Frontmatter name: kit-kysely-review

Include:
- A description with specific invocation conditions
- Steps to inspect database types and surrounding code
- Checks for joins, null handling, transactions,
  parameterization, and query performance
- Findings with severity, evidence, and file locations
- Examples of when to use and skip the skill

Follow existing project conventions.
Do not modify code unless requested.
Avoid generic advice and unsupported assumptions.
```

Candidate custom skills: Kysely query review, Fastify API implementation, database migrations, debugging, merge request review, and feature implementation. Add them incrementally as their workflows and evaluations become reliable.

Anthropic's `skill-creator` can optionally assist with drafting and evaluation. It is an authoring aid, not a required runtime dependency or an automatically bundled third-party skill.

## 8. Command specification

| Command | Behavior |
| --- | --- |
| `init` | Select presets, calculate changes, and install guidelines and components |
| `add <type/name>` | Install an item, or every item of a preset with `add preset/<name>` |
| `list` | Display the catalog available in this CLI version |
| `show <type/name> [--file <path>]` | Print the bundled content of an item's files, or their packaged paths, for manual comparison |
| `status` | Display installed versions, local changes, and missing files |
| `update [type/name]` | Update installed items from the registry bundled with the CLI |
| `remove <type/name>` | Remove managed items that have not been modified |
| `eject <type/name>` | Stop managing an item: drop it from the manifest and leave its files untouched as user-owned |
| `doctor` | Check installation validity and report actionable diagnostics without editing files |
| `uninstall` | Remove the selected installation while preserving user-owned content |

All commands support `--cwd <path>` and `--json`. Mutating commands also support `--dry-run`; `init` supports repeated `--preset <name>` and optional `--context`. `update` supports `--allow-major`. Read-only commands reject inapplicable mutation flags. There is no `--yes` flag in the initial release: the only interactive prompt is `init` preset selection, which `--preset` replaces.

In noninteractive terminals, commands requiring a choice must fail with a message explaining the required flags. Use exit code `0` for success, `1` for errors, and `2` for conflicts requiring user action. `--dry-run` uses the same codes as the real run would, so a preview containing conflicts exits with `2`.

`status` performs no network lookup. `npx ...@latest update` retrieves the latest CLI through npm and uses the registry bundled with that version.

## 9. Installation and update flow

1. Determine the target root from the current directory or `--cwd`.
2. Read the manifest and existing destination files.
3. Resolve presets into items.
4. Validate all paths and schemas before writing.
5. Produce a change plan per item: create, update, unchanged, or conflict.
6. For `--dry-run`, display the plan without creating files or directories.
7. Resolve conflicts at item granularity. When the user named specific items (`add`, `remove`, `update <item>`, `init`), any conflict cancels the whole command. A no-argument `update` skips each conflicted item as a whole, applies the remaining items, lists the skipped items with resolution steps, and exits with `2`.
8. Acquire the target lock and revalidate preflight state. Write new content to staging files beside their destinations, keep backups of replaced files, then rename into place; on failure, restore the backups.
9. Write the manifest last, after all changes succeed.
10. Report changed files and commands for inspecting the result.

The manifest records the schema version, CLI version, presets, item versions, destinations, and checksums of the last installed content. For root instruction files, store only managed block checksums so edits outside those blocks do not cause conflicts.

Checksums are computed over normalized content: strip a leading UTF-8 BOM, convert CRLF and CR to LF, and ignore a single trailing newline difference. Line-ending conversion by git (`core.autocrlf`) or editors must never produce a conflict. Comparisons between local files and registry content use the same normalization.

Presets act only when items are selected, through `init` or `add preset/<name>`. The manifest records which presets were requested, but installed items are the source of truth: `update` never installs items newly added to a preset and never reinstalls items the user removed. `status` lists catalog items that belong to a requested preset but are not installed, as a suggestion. Running `init` again with additional presets behaves like `add` for the new items.

Update rules:

- Current content matches the last installed checksum: updating is allowed.
- Current content matches the new version: no rewrite is needed.
- Current content differs from both versions: report a conflict and do not overwrite.
- A managed file is missing during update: report a conflict so a user deletion is not silently reversed. During remove or uninstall, treat an already missing file as removed and clear its bookkeeping after the transaction succeeds.
- A new registry file collides with an unmanaged existing file: report a conflict, unless the existing content already matches the incoming content, in which case adopt it into the manifest without rewriting.
- Files removed from the registry may be deleted locally only if their checksums still match.

The initial version has no automatic merge or force flag. Resolve conflicts with the recipes in the customization policy (section 13).

## 10. Implementation constraints

- Do not execute registry scripts or add lifecycle hooks to target projects.
- Reject absolute registry destination paths, `..`, and symlinks that could escape the target root.
- Detect concurrent writes and changes made since preflight before replacing files.
- Repeated commands must be idempotent, including managed blocks.
- The core produces installation plans; adapters map file locations; the writer applies plans.
- Use filesystem APIs rather than shell commands to copy files.
- Document the minimum Node version and test supported versions.
- Windows support must avoid symlink requirements and POSIX separator assumptions.
- Normalize line endings before hashing or comparing content; preserve a file's existing line endings when rewriting a managed block inside it.

## 11. Implementation phases

### Phase 1 — Foundation and contracts

- [x] Select and record the minimum Node version.
- [x] Recheck current Claude Code documentation for rules (`paths` frontmatter, subdirectory discovery), skills, and subagents.
- [x] Set up the TypeScript workspace, build, linting, and tests.
- [x] Define registry, manifest, and installation plan schemas.
- [x] Implement content normalization and checksums shared by the build and the CLI.
- [x] Implement the Claude adapter and destination validation.
- [x] Write core guidelines and the `base` preset.
- [x] Define the project context template and reusable evaluation case format.
- [x] Define preset membership and the supported compatibility table.

Complete when the built CLI can read and validate the bundled registry.

### Phase 2 — Installation

- [x] Implement `list`, `show`, `init`, and `add`.
- [x] Implement managed blocks and the Claude import bridge.
- [x] Add `--cwd`, `--dry-run`, `--preset`, and noninteractive mode.
- [x] Implement staging, manifests, local edit detection, project locks, and rollback.
- [x] Add interruption tests showing that a rerun converges and the manifest never records unapplied changes.
- [x] Define human and JSON output contracts with stable diagnostic codes.
- [x] Implement explicit target selection and test root and package installations in a monorepo fixture.
- [x] Add the initial skills and rules catalog.
- [x] Install this repository's own managed blocks through the CLI.
- [x] Document the custom skill generation workflow and write evaluation cases for each initial skill.
- [ ] Run each initial skill's evaluation cases with Claude Code and record the results.

Complete when installation works for new projects and projects with existing instructions without losing content.

### Phase 3 — Lifecycle

- [ ] Implement `status`, `update`, `remove`, and `eject`.
- [ ] Implement item-level conflict skipping for no-argument `update`.
- [ ] Handle missing files and file list changes between item versions.
- [ ] Display conflicts with clear resolution instructions.
- [ ] Implement read-only `doctor` diagnostics.
- [ ] Add major-version update checks and the explicit `--allow-major` flag.
- [ ] Reject unsupported newer registry and manifest schemas without mutation.
- [ ] Document the customization and ownership policy, including conflict resolution recipes.
- [ ] Extend interruption tests to lifecycle operations.
- [ ] Implement `uninstall`, including conflicts, dry runs, and repeat execution.

Complete when lifecycle commands preserve user changes, a customized item never blocks updates to other items, and interrupted operations converge on rerun.

### Phase 4 — Verification and distribution

- [ ] Finalize the repository name and npm scope.
- [ ] Implement GitHub Actions `ci.yml` and `compatibility.yml` for pull requests and default-branch pushes.
- [ ] Test Linux, macOS, and Windows across the supported Node matrix.
- [ ] Configure required checks and secure release workflow permissions.
- [ ] Verify the `npm pack` tarball, `bin` field, shebang, and registry assets.
- [ ] Run the CLI from a local tarball in a separate project.
- [ ] Test in Claude Code: instruction imports, rules, `/kit-code-review`, and subagents.
- [ ] Write the README, command reference, contribution guide, and changelog.
- [ ] Record source provenance, licenses, and required notices for reused content.
- [ ] Record agent evaluation results for initial skills and document versioning rules.
- [ ] Add content quality checks to CI.
- [ ] Document release, published-package smoke testing, and recovery procedures.
- [ ] Prepare the release workflow; publish only after the package identity, compatibility ranges, publisher setup, and release authorization are established.

Complete when the packaged CLI installs content that Claude recognizes.

### Phase 5 — Future development

- [ ] Add Codex and other agent adapters using their respective documentation.
- [ ] Add explicitly selected global installation scope.
- [ ] Add a remote registry with version pinning, integrity verification, and caching.
- [ ] Add diff previews and conflict resolution assistance.
- [ ] Add a persisted transaction journal and `recover` command if staged writes prove insufficient (see section 15).
- [ ] Add an upgrade migration framework before the first item rename, destination move, or manifest schema change.
- [ ] Add item dependency resolution when an item genuinely requires another.
- [ ] Add monorepo overlap scanning across ancestor and workspace package installations.
- [ ] Add Claude plugin distribution if users need native integration.

## 12. Acceptance criteria

- One command installs configuration into another repository.
- Repeating installation with identical inputs produces no changes.
- Existing content outside managed blocks remains intact.
- `--dry-run` causes zero filesystem mutations.
- Updates preserve local modifications.
- A locally customized item does not block updates to other items, and can be ejected from management.
- Line-ending conversion alone never produces a conflict.
- Write failures do not leave a manifest claiming successful installation.
- Registry items cannot write outside the target or access destinations through unsafe symlinks.
- The npm package includes every required file.
- Claude Code reads instructions and discovers installed skills and agents.
- Skill references consistently use the `kit-` prefix across folders, frontmatter, and documentation.
- All distributed content and documentation are written in English.
- Project context remains user-owned and survives update and removal.
- `doctor` reports invalid configuration without modifying files.
- Major item upgrades require explicit selection.
- Reused content includes traceable provenance and required license notices.
- Presets install only available items and do not silently select a detected stack.
- Unsupported runtime or schema versions fail before writing.
- Release checks validate content, packaged assets, and documented recovery steps.
- GitHub Actions runs deterministic checks and cross-platform integration tests before merge.
- Pull request workflows cannot publish packages or access release credentials.
- JSON mode emits a stable machine-readable result without interactive or formatting noise.
- An interrupted command never leaves a manifest recording unapplied changes, and rerunning it converges without overwriting user edits.
- Commands mutate only the explicitly selected installation target.
- Uninstall preserves user-owned content and rejects modified managed files.
- Custom skills have reviewed invocation conditions and recorded evaluation expectations and results before release.

## 13. Project context and catalog maintenance

### Project context template — priority

`init --context` optionally creates a project-owned `docs/agent-context.md` template recording:

- Project purpose, repository layout, and architecture boundaries.
- Languages, frameworks, database tooling, and supported runtime versions.
- Setup, development, build, lint, typecheck, and test commands.
- Relevant coding conventions and links to authoritative project documentation.
- Migration procedures and any environment-specific constraints.

The CLI creates an unfilled template; maintainers or their coding agent populate it from inspected files and maintainer input. Mark unfilled fields explicitly rather than pretending they are verified commands. Do not include secrets. Generic skills should consult project instructions and this context when available. When `--context` is selected, include a relative reference in the managed guidelines block so agents can locate it. Existing populated context can be referenced without claiming ownership.

Once initialized, context belongs to the project. Updates must not overwrite it, and removal must preserve it. Existing context files are reused only after inspection; incompatible content is reported rather than replaced. Projects without this file remain supported.

### Skill evaluation cases — priority

Store authoring evaluations under `evals/<skill-id>/`, separate from installed runtime content. Include case inputs, fixtures or fixture references, expected outcomes, and recorded results.

Each skill should have at least a normal case, an edge case, and a negative invocation case. Define observable expectations such as identifying a known query defect, respecting a no-edit boundary, or avoiding an unrelated task. Do not require exact wording.

Run relevant evaluations when instructions or supporting tools change. Record the skill version, agent/model used, environment, date, and outcome. Keep deterministic schema and file checks in CI; agent evaluations may run separately and require access to an appropriate agent. Do not claim evaluation success from schema validation alone.

### Content versioning

Version each registry item independently and release the bundled catalog through npm package versions.

| Change | Item version increment |
| --- | --- |
| Wording fixes or clarifications without changing the workflow contract | Patch |
| Compatible new checks, examples, or optional capabilities | Minor |
| Changed invocation name, required inputs, output contract, destinations, or incompatible dependencies | Major |

Track content changes in the changelog. Avoid silently upgrading an installed item across major versions: report the change and require an explicit `update --allow-major` selection. Document any manual migration steps.

### Third-party source tracking

For reused skills, record the source repository URL, exact commit or tag, upstream path, license identifier or license file, attribution requirements, and local modifications. Preserve required notices in the distributed package.

Use pinned content rather than following upstream branches during installation. Review upstream changes before incorporating them into a release. Do not bundle material when redistribution rights are unclear; use an external reference instead. Original skills should identify this repository as their source.

### Installation diagnostics

`status` summarizes installation state; read-only `doctor` validates manifests, managed blocks, imports, adapter frontmatter, and local name collisions. Both report a held lock and files that differ from the manifest without repairing them. Include actionable diagnostics with file locations; project-scoped checks cannot guarantee detection of every global or plugin collision.

### Customization policy

Users may edit installed skills and rules; their changes remain authoritative locally. A modified item is skipped by no-argument `update` and reported as a conflict; other items continue to update. Document these resolution recipes:

| Situation | Keep mine | Take upstream |
| --- | --- | --- |
| Managed file edited locally | `eject <item>`; the files become user-owned and are no longer updated | Compare with `show <item>`, restore the bundled content (or revert via version control), then `update <item>` |
| Managed file deleted locally | `eject <item>` or `remove <item>` (an already missing file counts as removed) | Restore the file from `show <item> --file <path>`, then `update <item>` |
| Unmanaged file occupies a new destination | Rename or move the existing file, then retry | Replace it with the bundled content; identical content is adopted automatically |

Users can keep substantially different workflows as separately named project skills outside Agent Kit ownership. They must choose unique names and invocation descriptions to avoid ambiguous activation. Do not auto-merge instructions or rename skills behind the user's back.

Document ownership clearly: managed root instruction blocks and registry files are tracked; user content outside those blocks and project context are preserved. Installation manifests remain CLI-owned bookkeeping.

## 14. Compatibility, upgrades, and releases

### Preset selection

Keep the default installation small. Presets reference existing registry items; an item shared by several selected presets is installed once. Preset semantics after installation are defined in section 9.

| Preset | Initial contents |
| --- | --- |
| `base` | Core engineering guidelines, code-review, debugging, feature-implementation, and testing rules |
| `node` | `base` plus TypeScript rules; add evaluated Fastify and Kysely skills when available |
| `python` | `base` plus Python rules; add evaluated Python-specific skills when available |

Database-design and specialist agents remain optional items initially. Do not list planned skills as installable until their content and evaluations are ready. Support explicit selection through `init --preset <name>`, repeated `--preset` flags, and `add preset/<name>`; default to `base`. Detecting stack files may suggest presets but must not silently install them.

### Compatibility policy

Publish a compatibility table covering supported Node versions, operating systems, Claude Code versions, registry schema versions, and manifest schema versions. Determine concrete version ranges during implementation from documentation and actual verification; do not claim untested compatibility.

Set the npm `engines` field and fail early on unsupported runtimes with actionable guidance. Adapters should validate required format features before writing. Reject newer unsupported registry or manifest schemas without mutation. Older schemas may be accepted only through an explicit, tested migration path.

### Upgrade migrations — deferred

The initial release has no earlier schemas, item IDs, or destinations to migrate from, so the migration framework is deferred until the first such change; the requirements below govern its design. Until then, the CLI rejects unsupported schemas without mutation, and the registry must not rename items or move destinations.

Provide versioned migrations for renamed item IDs, changed invocation names, moved files, and older manifest formats. Record affected versions and explain the user-visible changes.

Plan migrations before writing. Preserve locally modified files and report conflicts. Move or remove an old managed file only when its recorded checksum matches; treat destination collisions as conflicts. Update references owned by the CLI and report user-owned references that need manual adjustment. Never rewrite unrelated project files.

Apply file and manifest migrations in the same staged transaction with rollback. Include tests for successful upgrades, modified source files, occupied destinations, unsupported schemas, and interrupted writes. Preview migrations through `--dry-run`; incompatible item upgrades require `--allow-major`.

### Content quality checks

Add registry validation to CI and release checks:

- Valid frontmatter, unique IDs and names, supported metadata, and consistent `kit-` prefixes.
- Existing local Markdown references and supporting assets, checked relative to their containing files.
- No unintended placeholders in executable instructions or registry metadata. Explicitly labeled fill-in fields are allowed in project context templates.
- No destination collisions, nonempty `dependencies`, or references to unavailable items.
- Required provenance and license notices for reused content.

Review trigger descriptions for specific tasks, clear boundaries, and overlaps with other skills. Use invocation evaluations to assess vague or overly broad triggers; structural validation alone cannot establish good activation behavior. Check external links separately so transient network failures do not make core validation unreliable.

### GitHub Actions CI

Use GitHub Actions for pull request checks and release automation. Workflow files live in `.github/workflows/`.

| Workflow | Trigger | Checks |
| --- | --- | --- |
| `ci.yml` | Pull requests and pushes to the default branch | Formatting, lint, typecheck, registry/content validation, unit tests, build, and CLI integration tests |
| `compatibility.yml` | Pull requests and pushes to the default branch | CLI integration tests on Ubuntu, macOS, and Windows across declared supported Node versions |
| `release.yml` | Explicit release dispatch or approved version tag | Re-run release gates, pack and inspect assets, publish to npm, and smoke-test the published version |

Implementation requirements:

- Install the declared pnpm version and use `pnpm install --frozen-lockfile`.
- Cache the pnpm store and cancel superseded CI runs on the same branch.
- Default to `permissions: contents: read`; elevate only the release job permissions required by the chosen publishing mechanism.
- Pin external actions to reviewed commit SHAs and update them through a dependency maintenance process.
- Test installation from the generated tarball in a clean temporary project, not only from workspace source.
- Exercise idempotency, dry-run behavior, edit conflicts, line-ending conversion, ejection, removal, interruption, and rollback in integration tests.
- Upload useful failure logs and packed artifacts without credentials or sensitive fixtures.
- Make formatting, types, registry validation, and integration checks required before merging. Keep check names stable for branch protection.
- Fork pull request checks must not require publishing credentials. Do not run untrusted pull request code with privileged release tokens.
- Keep agent-driven skill evaluations separate from deterministic CI when credentials, cost, or nondeterministic execution require it; record their results before releasing changed skills.

Use npm trusted publishing through GitHub OIDC when supported by the selected publisher setup; otherwise document narrowly scoped release credentials. Publishing must follow the separately authorized release process, and CI checks never publish on ordinary pushes or pull requests.

### Release process

1. Review content changes, evaluation results, compatibility notes, and provenance.
2. Assign item version increments, bump the npm package version, and write changelog entries and migration notes.
3. Run the supported CI matrix, registry validation, and relevant migration and CLI integration tests.
4. Build and inspect `npm pack`; install the tarball into a clean fixture project and verify executable and bundled assets.
5. Tag the reviewed commit and publish through a release workflow using an authorized npm publisher identity. Publishing requires a separate user instruction.
6. Smoke-test the published package from a clean project and document its catalog and compatibility versions.

Document recovery by running a previously known package version and restoring project changes from version control or a retained backup. An older CLI must refuse a newer unsupported manifest rather than attempt an unsafe downgrade. Prefer a corrective release for faulty published versions; do not assume npm unpublishing or installing an older version reverses project changes.

## 15. CLI behavior and recovery

### CLI output contract

Use concise human-readable output by default: summarize the target, planned or applied changes, conflicts, and next actions. Send diagnostics to stderr and ordinary results to stdout. Disable color when output is redirected and respect `NO_COLOR`.

Support `--json` on all commands. Emit one JSON result object with an `outputSchemaVersion`, command, status, target, changes, diagnostics, and stable error codes. Keep stdout free of prompts, progress text, and ANSI formatting in this mode. Require explicit choices for noninteractive execution. Preserve the documented exit codes across human and JSON modes.

Use stable diagnostic codes such as `LOCAL_EDIT_CONFLICT`, `UNSUPPORTED_SCHEMA`, and `LOCK_HELD`. Include affected paths and a practical next action. Never print credentials or sensitive file contents as part of errors.

### Interrupted-install behavior

Normal exception rollback does not cover termination or machine failure. The initial release relies on ordering instead of a persisted journal: staged files are renamed into place one at a time and the manifest is written last, so an interruption can leave new files on disk but never a manifest recording changes that did not happen. Rerunning the same command converges, because files already matching the new content are treated as unchanged (managed files) or adopted (new files), and genuinely edited files still produce conflicts. Target projects are usually under version control, which covers the remaining recovery cases; document that path.

Acquire a project-scoped lock under `.agent-kit/` to prevent concurrent mutating commands. The lock records process ID, host, and start time. Do not treat a lock as stale merely because its age exceeds a timeout; when the owning process cannot be confirmed dead on the same host, report `LOCK_HELD` and have `doctor` explain how to remove the lock manually. Remove staging files and backups after a successful manifest write; `doctor` reports leftovers from an interrupted run. `--dry-run` and read-only commands never create locks, staging files, or backups.

Test termination before writes, between file replacements, and around the final manifest write, and verify that a rerun converges without overwriting user edits. A persisted transaction journal and explicit `recover` command are deferred to Phase 5 and should be added only if this approach proves insufficient.

### Monorepo behavior

Treat the current directory as the installation target unless `--cwd` is supplied. Do not silently move to the git root or discover and mutate sibling packages.

Support either a repository-root installation or an explicitly selected package installation. Each target owns its manifest and managed files. A root installation may affect descendant agent behavior according to the supported adapter's discovery rules; package installations may add local context and components.

The initial release does not scan for other installations: it inspects only the selected target and never reads or rewrites another target's manifest. Document that installing overlapping items at both root and package level is unsupported. Overlap detection across ancestor and workspace package manifests is deferred to Phase 5. Document adapter-specific discovery behavior and verify root/package examples in integration tests. `uninstall` applies only to the selected target.

### Uninstall

Add `uninstall` to remove all tracked components from the selected installation. Use the same preflight, checksum checks, lock, staging, and rollback mechanisms as updates.

- Remove untouched managed files and CLI-owned root instruction blocks.
- Preserve user-owned imports, project context, and content outside managed blocks.
- If any managed content has local edits or ambiguous ownership, report conflicts and cancel the entire batch.
- Remove generated instruction files only when their remaining content is empty and the manifest records that the CLI created them.
- Delete empty CLI-created directories only; preserve directories containing unrelated files.
- Remove the manifest last.

Support `--dry-run` and `--json`. Do not uninstall npm, Claude, global skills, or components belonging to another target. An absent manifest is a successful no-op; never infer ownership of orphaned files from their names. Users must resolve edited-file ownership explicitly before retrying; there is no implicit destructive force mode.

## 16. References

The following documentation and source repositories inform file formats and CLI behavior. The Agent Kit architecture and commands above are design decisions for this project.

- [Claude Code memory and imports](https://code.claude.com/docs/en/memory)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code rules](https://code.claude.com/docs/en/memory#organize-rules-with-clauderules)
- [Anthropic skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator)
- [Vercel Skills CLI](https://github.com/vercel-labs/skills)
- [shadcn/ui source](https://github.com/shadcn-ui/ui)
- [npm package.json and executable bin](https://docs.npmjs.com/cli/configuring-npm/package-json)

Recheck Claude documentation before implementing adapters because formats and discovery behavior may change.
