---
name: engineering-guidelines
description: "Core engineering guidelines: inspect the code and conventions before changing anything, keep changes scoped, verify with the project's own commands, and report honestly. Use when planning, writing, changing, or reviewing code in any project. Do not use for questions unrelated to software work."
---

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
