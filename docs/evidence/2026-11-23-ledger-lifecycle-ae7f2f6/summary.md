# Org evidence: ledger-lifecycle

Outcome: **passed**

Started: 2026-11-23T07:35:17.789Z
Finished: 2026-11-23T07:54:09.054Z
Commit: ae7f2f6d2407eb216094f5ee6ca620eeb985fe23
Package version: 04tfj000000n3O9AAI
Security type: AdminsOnly

## Checks

- passed: Installed warden-base version is 04tfj000000n3O9AAI — 0.1.1.3 (04tfj000000n3O9AAI)
- passed: Ordinary Grant edit blocked — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: Grant delete blocked — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: Run delete blocked — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: Item delete blocked — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: First two-field revocation stamp accepted
- passed: Run and Item field updates accepted
- passed: Second revocation stamp blocked — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: Clearing the revocation stamp blocked — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: Non-admin Ledger Maintenance user purged Grant and Run
- passed: Run purge cascaded to its master-detail Item
- passed: AdminsOnly System Administrator bypasses the ledger guard
- passed: Run and Item remain before uninstall
- passed: Uninstall removed the package and its populated Run object

## Metrics

```json
{
  "userLicenses": [
    {
      "Name": "Salesforce",
      "TotalLicenses": 2,
      "UsedLicenses": 1
    },
    {
      "Name": "Salesforce Platform",
      "TotalLicenses": 3,
      "UsedLicenses": 0
    }
  ],
  "publisherIdentity": null
}
```
