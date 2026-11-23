# Org evidence

Use the harness to verify a Warden Base package version in a Developer scratch
org. Authenticate the Salesforce CLI to a Dev Hub before running. The harness
uses `DEVHUB_ALIAS` (default `devHub`) and `SCRATCH_DURATION` (default one day).
Every run needs a subscriber package version ID beginning with `04t`.

```bash
npm run org:evidence -- --scenario install-smoke --package 04tfj000000mt2DAAQ
```

The default install security type is `AdminsOnly`. Pass
`--security-type AllUsers` to measure that setting in `install-security`.
Use a separate, freshly created scratch org for each security type. The
upgrade, ledger lifecycle, and install security scenarios each run alone and
create their own scratch org. Pass a distinct `--upgrade-from <04t>` for the
upgrade. The smoke scenario accepts `--org <alias>` for a disposable scratch org
you already authenticated. The harness retains an explicitly supplied org.
It deletes orgs it creates unless you pass `--keep`.

## Scenario catalog

### 0.1.1.3

Build `04tfj000000n3O9AAI` from commit `d638260`. The evidence folders carry
`ae7f2f6`, the beta record commit the harness ran from.

| Scenario                                          | Checks                              | Needs                                      | Latest result                                                         |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| [Install smoke](scenarios.md#install-smoke)       | Package version, schema, CLI writes | `AdminsOnly`, disposable scratch org       | [Passed](2026-11-23-install-smoke-ae7f2f6/summary.md)                 |
| [Install upgrade](scenarios.md#install-upgrade)   | Upgrade, record IDs, guard, schema  | `AdminsOnly`, fresh org, predecessor `04t` | [Passed](2026-11-23-install-upgrade-ae7f2f6/summary.md), from 0.1.0.2 |
| [Ledger lifecycle](scenarios.md#ledger-lifecycle) | Guard, purge, uninstall             | `AdminsOnly`, fresh org                    | [Passed](2026-11-23-ledger-lifecycle-ae7f2f6/summary.md)              |
| [Install security](scenarios.md#install-security) | Profile grants and object access    | `AdminsOnly`, fresh org                    | [Passed](2026-11-23-install-security-ae7f2f6/summary.md)              |
| [Install security](scenarios.md#install-security) | Profile grants and object access    | `AllUsers`, fresh org                      | Not run. The release plan covered three scratch orgs.                 |

Install smoke ran on the org that the upgrade kept. On that same org, the
source of a dependent extension package (commit `88dff6e`) was deployed and RunLocalTests ran
155 tests: 132 extension and 23 base. All passed once the org had the
extension's Communities settings (`enableNetworksEnabled`,
`enableOotbProfExtUserOpsEnable`). Without them, two `wdn_SiteAccessTest`
portal tests can't create their portal users. This check isn't a harness
scenario, so it has no evidence folder.

The 0.1.1.2 beta (`04tfj000000n2S5AAI`) passed the same base scenarios but
failed that extension check. Its component lock test counted queries that the
extension's component trigger adds. 0.1.1.3 fixes the test (#23). 0.1.1.2 won't
be promoted. Its passing scenario runs:
[install-security](2026-11-23-install-security-9b388ac/summary.md),
[install-smoke](2026-11-23-install-smoke-93d0659/summary.md),
[install-upgrade](2026-11-23-install-upgrade-93d0659/summary.md) and
[ledger-lifecycle](2026-11-23-ledger-lifecycle-93d0659/summary.md).

### 0.1.0.2

| Scenario                                          | Checks                              | Needs                                      | Latest result |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------ | ------------- |
| [Install smoke](scenarios.md#install-smoke)       | Package version, schema, CLI writes | `AdminsOnly`, disposable scratch org       | —             |
| [Install upgrade](scenarios.md#install-upgrade)   | Upgrade, record IDs, guard, schema  | `AdminsOnly`, fresh org, predecessor `04t` | —             |
| [Ledger lifecycle](scenarios.md#ledger-lifecycle) | Guard, purge, uninstall             | `AdminsOnly`, fresh org                    | —             |
| [Install security](scenarios.md#install-security) | Profile grants and object access    | `AdminsOnly`, fresh org                    | —             |
| [Install security](scenarios.md#install-security) | Profile grants and object access    | `AllUsers`, fresh org                      | —             |

## Evidence files

Each scenario writes `docs/evidence/YYYY-MM-DD-<scenario>-<short-commit>/`.
Repeated runs for the same date, scenario and commit get `-2`, `-3` and later
suffixes.

- `summary.md` lists the outcome, checks and metrics.
- `summary.json` includes those results, the source commit, the target package
  version, the security type and the identities used.
- `scenario/` contains observations such as contract diffs, install or uninstall
  responses and Salesforce CLI results. Large artifacts are truncated and
  structured artifacts remain valid JSON.

The harness warns when the working tree has uncommitted changes, and
`summary.md` then shows the commit as `(dirty)`. Run from a clean checkout so
the recorded commit reproduces the evidence.

A failed, blocked, or errored scenario returns a nonzero exit code and records
any evidence collected. The harness redacts usernames, credential fields,
session tokens and auth URLs from the files. Review the files before committing
them to the public evidence catalog.

## Test identities

The scratch admin installs the package, queries observations and creates the
assignment fixture. The publisher and integration actions use authenticated
non-admin users. The harness prefers Salesforce Platform seats and can use
one Salesforce seat for both CLI roles when only one seat is available. It
assigns each packaged permission set for its phase, removes it afterward and
verifies removal before the user switches roles. Removal still runs when the
phase fails. If removal also fails, the harness reports both errors. The smoke,
upgrade, and ledger lifecycle summaries include the observed license counts.

The shipped Integration permission set grants no Delete on ledger objects, so a
delete as that user fails on object permissions before the ledger guard runs.
The harness first checks that Integration grants no Delete. Then each delete
probe also holds `Warden_Evidence_Delete_Probe`, an org-only permission set the
harness creates in the evidence org. It grants Read, Edit and Delete on Run,
Item and Grant, and no Ledger Maintenance, View All or Modify All. It is never
packaged. The harness checks Ledger Maintenance from the admin connection,
because anonymous Apex run by these users can't call `FeatureManagement` or
`UserInfo`.

A test user must hold no Warden Base permission set before a scenario assigns
one. If an earlier run stopped mid-phase, the next run records an error for
that scenario. Remove the leftover assignment before you reuse the org with
`--org`.
