# Security

## Reporting a vulnerability

Report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue. Include the agent-kit version, the command you ran, and a minimal reproduction.

## Threat model

agent-kit runs in a user's repository, or with `--global` in their home directory, and creates, replaces, and deletes files there. The bundled catalog is trusted: it is validated and checksummed at build time and verified again when the CLI loads it. **The target directory is untrusted**: it may come from a cloned repository and contain symlinks, special files, or a hand-crafted `.agent-kit/manifest.json`.

The CLI enforces the following against a hostile target:

- **No writes, deletions, or reads outside the target.** Every destination is a relative path without `..`. Parent directories must resolve inside the target, and symlinked destinations are refused. `.agent-kit` must be a real directory inside the target, and the lock file is created without following symlinks.
- **Only files agent-kit manages are touched.** Manifest paths (item files, guideline blocks, the context file, and created directories) must match the layout agent-kit installs, and `.git` is never a valid destination. Otherwise the manifest is rejected with `MANIFEST_INVALID` before anything changes. Edited or unrecognized files are reported as conflicts, never overwritten or deleted.
- **No code execution.** The CLI never starts processes, evaluates content, or runs scripts shipped with skills.
- **Bounded work on hostile input.** State files are read only if they are regular files under 1 MiB, and target files over 4 MiB are refused. Block parsing is linear, and workspace patterns are capped and deduplicated.
- **No terminal injection.** Control characters from manifests and files are escaped in human-readable output; `show --file` prints bundled content unchanged for redirection.

## Accepted risks

- **Concurrent local tampering.** Between the final check of a destination and the rename that replaces it, another process running as the same user could swap a parent directory for a symlink. Exploiting this requires an attacker already active on the machine, which is outside this model; the window is narrow, and every write is checked against the state read under the project lock.

## Development and CI

- **Workflows.** GitHub Actions are pinned to commit SHAs, run with read-only permissions, and pass untrusted values such as pull request titles through environment variables, not `${{ }}` in scripts. Only the manually dispatched, approval-gated release job can publish, using npm trusted publishing without stored tokens.
- **Evaluations.** `evals/run.mjs` runs agents with the tools that cases allow, so pull requests that change `evals/` must be reviewed as code.
- **Git hooks.** The pre-commit hook passes staged file names after `--`, so they cannot act as tool options.
