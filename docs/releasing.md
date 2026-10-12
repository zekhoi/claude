# Releasing

Publishing requires an explicit decision by a maintainer. Pull requests and pushes never publish, and the release workflow publishes only after manual dispatch and approval.

## One-time setup

1. The package is `@zekhoi/agent-kit`, published from the `zekhoi` npm account. Log in to npm as that account before configuring trusted publishing.
2. The license is MIT (`LICENSE` at the repository root and in `packages/cli/`). Keep both copies identical.
3. On npmjs.com, configure [trusted publishing](https://docs.npmjs.com/trusted-publishers) for the package with this repository and the workflow file `release.yml`. No npm token is stored in GitHub.
4. In the GitHub repository settings, create an environment named `npm-publish` with required reviewers, and restrict it to the default branch.
5. Protect the default branch: require pull requests and the status checks `checks` (CI) and every `test (...)` job (Compatibility).

### First publish

npm's documentation does not say whether a trusted publisher can be configured before the package exists. If npmjs.com does not offer trusted publishing for `@zekhoi/agent-kit` yet, publish 0.1.0 from the gated tarball instead of building one locally:

1. Run the **Release** workflow for `0.1.0`. When it waits for approval on `npm-publish`, reject the deployment.
2. Download the `release-package` artifact from that run; it is the tarball that passed every gate.
3. Logged in to npm as `zekhoi`, run `npm publish zekhoi-agent-kit-0.1.0.tgz --access public`.
4. Configure trusted publishing for the package, then run `node scripts/smoke-published.mjs 0.1.0`.

Later releases use the workflow end to end. Trusted publishing generates provenance automatically and needs npm 11.5.1 or later, which the publish job's Node 24 provides.

## Each release

1. Review content changes, evaluation results, compatibility notes, and provenance.
2. Bump item versions in `registry/index.json` following the [versioning rules](PLAN.md#content-versioning), and bump `packages/cli/package.json`.
3. Move the `Unreleased` changelog entries under `## <version>` and add migration notes for anything users must do.
4. Make sure every shipped skill has an evaluation record for its current version in `evals/<skill>/results/` (see [evals/README.md](../evals/README.md)).
5. Run `node scripts/check-release.mjs <version>` locally; it lists anything missing.
6. Merge to the default branch with CI and the compatibility matrix green.
7. Run the **Release** workflow with the version. It re-runs all gates, verifies and uploads the tarball, waits for approval on `npm-publish`, publishes that exact tarball with provenance, and smoke-tests the published package with `scripts/smoke-published.mjs`.
8. Tag the released commit `v<version>` and publish GitHub release notes from the changelog.

## If a release is faulty

- Prefer a corrective release with a higher version. Do not rely on `npm unpublish`; it is restricted and does not undo changes already made in users' projects.
- Deprecate the faulty version with `npm deprecate <package>@<version> "<reason and fixed version>"`.
- Users can run a previous version explicitly with `npx <package>@<good-version> <command>`. An older CLI refuses manifests written with a newer schema (`UNSUPPORTED_SCHEMA`) instead of downgrading them; in that case users restore their files from version control.
- Projects keep their own state in version control: `git diff` and `git checkout -- <paths>` undo any Agent Kit change.

## Recovery for users

Interrupted commands are completed by rerunning the same command (see [customization.md](customization.md#interrupted-commands)). `agent-kit doctor` reports leftovers and inconsistencies without changing files.
