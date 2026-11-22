# The Warden Base contract

[contract.json](../contract.json) describes the six objects' field types,
picklist values, lookup targets and child relationships. It also lists the
object-level CRUD grants of the four permission sets. The version comes from
`versionNumber` in `sfdx-project.json`, without the fourth build segment.

Run `npm run contract:generate` after changing metadata or its package version.
`npm run contract:check` verifies that the generated file matches the metadata.
`npm test` runs the same check, so a stale file fails the gate. Each GitHub
release includes the contract from its tagged source tree.

The contract follows semantic versioning. Adding fields or permissions is a
minor change. Removing or renaming fields, changing field types, or narrowing
permissions is a major change. Compatible fixes without contract additions are
patch changes.

The CLI's Salesforce API calls depend on the published contract. Check its
release notes for the supported contract version before installing or upgrading
the package. The extension pins the exact Warden Base `04t` in its
`sfdx-project.json` package dependencies. To update the pin, select a new build
from the release evidence and verify the extension against it before releasing.
