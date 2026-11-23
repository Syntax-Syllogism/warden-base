# Org evidence: ledger-lifecycle

Outcome: **passed**

Started: 2026-11-23T06:52:44.526Z
Finished: 2026-11-23T07:10:40.166Z
Commit: 93d0659230d887d01c4df3754d8e52130d7151ff
Package version: 04tfj000000n2S5AAI
Security type: AdminsOnly

## Checks

- passed: Installed warden-base version is 04tfj000000n2S5AAI — 0.1.1.2 (04tfj000000n2S5AAI)
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
