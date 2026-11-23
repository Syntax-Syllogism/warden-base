# Org evidence: install-upgrade

Outcome: **passed**

Started: 2026-11-23T07:35:17.612Z
Finished: 2026-11-23T07:57:25.090Z
Commit: ae7f2f6d2407eb216094f5ee6ca620eeb985fe23
Package version: 04tfj000000n3O9AAI
Security type: AdminsOnly

## Checks

- passed: Installed warden-base version is 04tfj000000mt2DAAQ — 0.1.0.2 (04tfj000000mt2DAAQ)
- passed: smoke-before: publisher upserted persona and inserted two components
- passed: smoke-before: publisher denied Grant create access
- passed: smoke-before: integration inserted Run, Item and Grant and revoked the assignment
- passed: smoke-before: integration Run delete blocked by ledger guard — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: Installed warden-base version is 04tfj000000n3O9AAI — 0.1.1.3 (04tfj000000n3O9AAI)
- passed: wdn_Persona_Assignment__c records survived the upgrade — 1 before, 0 missing
- passed: wdn_Persona_Component__c records survived the upgrade — 2 before, 0 missing
- passed: wdn_Persona__c records survived the upgrade — 1 before, 0 missing
- passed: wdn_Provisioned_Grant__c records survived the upgrade — 1 before, 0 missing
- passed: wdn_Reconciliation_Item__c records survived the upgrade — 1 before, 0 missing
- passed: wdn_Reconciliation_Run__c records survived the upgrade — 1 before, 0 missing
- passed: Subscriber schema matches contract.json — 0 differences
- passed: Upgraded guard blocks edits to the existing Grant — Warden operational records can only be changed with the Ledger Maintenance permission.
- passed: smoke-after: publisher upserted persona and inserted two components
- passed: smoke-after: publisher denied Grant create access
- passed: smoke-after: integration inserted Run, Item and Grant and revoked the assignment
- passed: smoke-after: integration Run delete blocked by ledger guard — Warden operational records can only be changed with the Ledger Maintenance permission.

## Metrics

```json
{
  "upgradeFrom": "04tfj000000mt2DAAQ",
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
  "publisherIdentity": "base-publisher"
}
```
