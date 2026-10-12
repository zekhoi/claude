# Agent Kit development

Instructions for agents working on this repository. Content installed into user projects lives in `registry/`, not here.

- Read `docs/PLAN.md` before changing behavior; it is the source of truth for commands, safety rules, and scope.
- Use pnpm (`corepack pnpm` if pnpm is not installed). Before reporting work as done, run `pnpm -r run typecheck`, `pnpm -r run test`, `pnpm exec eslint .`, and `pnpm exec prettier --check .`.
- Registry source metadata never contains checksums; the build generates them. Run the tests after editing anything in `registry/`; they validate the real registry.
- The core produces plans, the adapter maps and validates destinations, and the writer applies plans. Keep filesystem writes out of the core.
- Never weaken path validation, checksum checks, or conflict handling to make a test pass.
- Write all distributed content and documentation in English.
- Do not publish the package or change release configuration without an explicit instruction.

<!-- agent-kit:start -->

## Engineering guidelines

### Before changing code

- Read the relevant code, tests, and project documentation before forming a plan. Do not assume structure, APIs, or conventions you have not inspected.
- Follow the conventions already used in the surrounding code: naming, layout, error handling, test style, and dependencies. Do not introduce a new framework or pattern without a stated reason.
- Clarify requirements that are genuinely ambiguous; otherwise choose the conventional option and state the assumption.

### While implementing

- Keep changes scoped to the task. Avoid unrelated refactors, renames, and formatting churn.
- Prefer existing utilities over new abstractions. Add an abstraction only when it removes real duplication.
- Handle errors and edge cases at the boundaries where they occur. Do not silently swallow failures.
- Never commit secrets, credentials, or personal data.

### Verifying

- Run the relevant tests, type checks, linters, and builds, using the commands the project documents.
- Add or update tests for changed behavior when the project has tests.
- If verification cannot run, say so and explain why instead of implying success.

### Reporting

- Summarize what changed, why, and how it was verified, including anything that failed or was skipped.
- Reference code by file path and line.

### Boundaries

- Deployments, publishing, sending messages, data deletion, and production changes require explicit instructions from the user.
- Code reviews report findings without editing code unless asked.

<!-- agent-kit:end -->
