# Releases and beta records

Warden Base is an unlocked second-generation package. New versions are created
as unpromoted betas. A beta can be installed for testing but isn't released.

## Versions

`sfdx-project.json` sets `versionNumber` to `0.1.0.NEXT` for the next build.
When Salesforce creates a version, it replaces `NEXT` with the build number,
such as `0.1.0.2`. The contract's `version` uses the first three segments. See
[contract](contract.md).

## Create a beta

```bash
node scripts/release/create-beta.mjs
```

Before it runs, check these conditions:

- The working tree is clean.
- `HEAD` is on `origin/master`. Fetch first. The `--allow-branch` flag skips
  this check, for testing only.
- The Dev Hub alias is authenticated. `DEVHUB_ALIAS` selects it and defaults to
  `devHub`.

The script then:

1. Runs `sf package version create` for `warden-base` with
   `--installation-key-bypass`, `--code-coverage` and `--tag <commit>`. It waits
   up to 60 minutes.
2. Reads the version report and writes
   `docs/evidence/releases/<version>/version.json`. The record includes
   `subscriberPackageVersionId` (starts with `04t`), `alias`, `commit`,
   `codeCoverage`, `hasPassedCodeCoverageCheck`, `released` and `installUrl`.
3. Lets `sf` add the alias to `packageAliases` in `sfdx-project.json`.
4. Commits the record and `sfdx-project.json` on a new
   `release/beta-<version>` branch. It never pushes or promotes.

With `--no-branch`, the changes stay uncommitted. The CI workflow uses that
flag.

## CI workflow

`.github/workflows/publish.yml` has two jobs.

- `create-beta` runs on a manual dispatch from `master`. It needs the
  `DEVHUB_SFDX_AUTH_URL` secret, runs `create-beta.mjs --no-branch`, and uploads
  `sfdx-project.json`, `contract.json` and `docs/evidence/releases/` as the
  `beta-release-record` artifact. CI doesn't commit the record. Commit it
  through a pull request.
- `attach-contract` runs when a GitHub release is published. It checks out the
  release commit, runs `contract:check`, and uploads `contract.json` to that
  release. An existing asset with the same name is replaced.

## Promotion

Creating a beta doesn't promote it. A promoted (released) version is a separate,
manual step that these workflows don't perform.

## Evidence

Each record ties a `04t` to its source commit and its code coverage result.
Consumers, including the extension's pin, should use the record to check a
build before they depend on it. See [installation](installation.md) and
[contract](contract.md).
