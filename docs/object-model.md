# Object model

[contract.json](../contract.json) lists the custom fields, picklist values and
child relationship API names for all six objects.

| Object                       | Role                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `wdn_Persona__c`             | Named access bundle. The CLI upserts by the unique external API name.                                                            |
| `wdn_Persona_Component__c`   | Permission or group reference in a persona, with a master-detail link to that persona.                                           |
| `wdn_Persona_Assignment__c`  | Links a Salesforce user to a persona and holds the assignment's status and revocation audit.                                     |
| `wdn_Provisioned_Grant__c`   | Records access granted to a user and the run that granted or revoked it. It can link directly to a persona and to an assignment. |
| `wdn_Reconciliation_Run__c`  | Reconciliation scope, counts, and provenance for CLI and native runs.                                                            |
| `wdn_Reconciliation_Item__c` | Per-user or per-action run detail. The master-detail child relationship is `wdn_ReconciliationItems__r`.                         |

Grant lookups restrict deletion of linked personas, assignments and runs. A
persona with assignments or grants cannot be deleted, and neither can an
assignment or run that a grant references. Removing a grant needs
[Ledger Maintenance](security.md). Deleting a persona cascades to its
components, as the master-detail link requires. Grant field history is enabled,
including the persona lookup.

On Active inserts and transitions to Active, the assignment trigger clears all
three revocation fields. Component inserts, updates and deletes lock the parent
persona rows.
