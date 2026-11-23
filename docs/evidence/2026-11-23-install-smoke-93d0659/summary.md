# Org evidence: install-smoke

Outcome: **passed**

Started: 2026-11-23T07:15:27.779Z
Finished: 2026-11-23T07:24:20.686Z
Commit: 93d0659230d887d01c4df3754d8e52130d7151ff (dirty)
Package version: 04tfj000000n2S5AAI
Security type: AdminsOnly

## Checks

- passed: Installed warden-base version is 04tfj000000n2S5AAI — 0.1.1.2 (04tfj000000n2S5AAI)
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
