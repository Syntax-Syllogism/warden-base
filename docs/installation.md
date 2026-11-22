# Installation

Warden Base is an unlocked second-generation Salesforce package with no namespace.
Use a Developer scratch org or a sandbox for a beta.

1. Find the build's record at `docs/evidence/releases/<version>/version.json`,
   where `<version>` is the package version, such as `0.1.0.2`. Copy its
   `subscriberPackageVersionId`, which starts with `04t`. The record also holds
   the source commit, the code coverage result and the install URL. If
   `docs/evidence/releases/` has no record, no beta exists yet; see
   [releases](releases.md).
2. Install as a Salesforce administrator. The CLI command installs for admins
   only so you can grant other users access through permission sets.

   ```bash
   sf package install --package "$WARDEN_BASE_04T" --target-org "$ORG_ALIAS" \
     --security-type AdminsOnly --wait 30 --publish-wait 10 --no-prompt --json
   ```

   This installation grants the System Administrator profile the
   [Ledger Maintenance custom permission](security.md#administrators-and-the-ledger-guard).

3. Assign the [permission sets](security.md) required for each user. Assign
   **Warden Base Viewer** to users who need the Warden Base Lightning app.
4. If using the native extension, check its pinned dependency before upgrading
   Warden Base. See the [versioning rules](contract.md).
