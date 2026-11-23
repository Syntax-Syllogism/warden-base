# Package evidence scenarios

Use a commit that contains the contract for the target release. See the
[evidence catalog](README.md) for recorded runs.

## Install smoke

Install the requested version and verify the installed `04t`, four permission
sets, and Ledger Maintenance custom permission. Compare the six subscriber
object describes with [contract.json](../../contract.json). Record missing or
changed fields, field types, reference targets, active picklist values, and
child relationships in `scenario/contract-diff.json`.

The publisher upserts a persona by external API name and inserts two
components. The scratch admin creates an active assignment. The integration
user inserts a run, an item, and a grant, then revokes the assignment. The
harness checks that the publisher lacks Grant create access and that a Run
delete reaches and is rejected by the ledger guard. CLI-shaped writes use
user-mode DML. The trigger probe uses system-mode DML under the integration
identity because Integration does not grant Run Delete. The fixture IDs go
in `scenario/smoke.json`.

## Install upgrade

```bash
npm run org:evidence -- --scenario install-upgrade --package 04tfj000000mt2DAAQ --upgrade-from 04tfj000000mpEjAAI
```

Install the 0.1.0.1 predecessor, exercise the smoke writes, and capture record
IDs for all six objects. Install 0.1.0.2 in the same org. Verify the target
version, that every captured record remains, and that its schema matches the
contract. Attempt a protected edit to a pre-upgrade Grant and repeat the smoke
writes. An explicit refusal to use the beta predecessor is recorded as
**blocked** with the Salesforce response. A future promoted predecessor can
be supplied with `--upgrade-from`.

## Ledger lifecycle

Use an `AdminsOnly` install. As the integration user, confirm that ordinary
Grant edits and Grant, Run, and Item deletes are blocked. Check that the first
paired revocation stamp and Run and Item updates succeed, and that a second
stamp or clearing the stamp is blocked.

Temporarily assign Ledger Maintenance to the non-admin user. Purge the Grant
before the Run, confirm that the Run's master-detail Item was removed, and
verify maintenance permission removal. The scenario then checks that the
System Administrator can delete a Grant because the `AdminsOnly` install
grants the profile Ledger Maintenance. The extension's 2026-10-19 evidence
used a source deployment and observed a blocked administrator delete.

With a Run and Item still present, attempt the package uninstall last. The
artifact records whether Salesforce removed the package and populated Run
object or refused the uninstall. It includes the Salesforce response.

## Install security

```bash
npm run org:evidence -- --scenario install-security --package 04tfj000000mt2DAAQ
npm run org:evidence -- --scenario install-security --package 04tfj000000mt2DAAQ --security-type AllUsers
```

Each command uses a fresh org. The scenario records the profile-owned and
permission-set grants for the Ledger Maintenance custom permission and the
profile-level object permissions for all six packaged objects. The check
expects only System Administrator under `AdminsOnly` and every profile in
the scratch org under `AllUsers`. The summary includes observed profile
counts and identifies missing or unexpected grants.
