# Org evidence: install-smoke

Outcome: **passed**

Started: 2026-11-23T07:58:00.423Z
Finished: 2026-11-23T08:06:40.640Z
Commit: ae7f2f6d2407eb216094f5ee6ca620eeb985fe23 (dirty)
Package version: 04tfj000000n3O9AAI
Security type: AdminsOnly

## Checks

- passed: Installed warden-base version is 04tfj000000n3O9AAI — 0.1.1.3 (04tfj000000n3O9AAI)
- passed: All four packaged permission sets exist
- passed: Ledger Maintenance custom permission exists
- passed: smoke: publisher upserted persona and inserted two components
- passed: smoke: publisher denied Grant create access
- passed: smoke: integration inserted Run, Item and Grant and revoked the assignment
- passed: smoke: integration Run delete blocked by ledger guard — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: Subscriber schema matches contract.json — 0 differences

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
      "UsedLicenses": 2
    }
  ],
  "publisherIdentity": "base-publisher"
}
```
