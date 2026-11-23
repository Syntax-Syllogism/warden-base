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

Some fields are required in metadata, not only on the page layouts, so the API
and Apex reject blanks too. The [contract](../contract.json) marks them
`required: true`. They include the type picklists on grants and components and
the grant's target ID.

The user lookups on assignments and grants are also required, but through the
active `wdn_Require_User` validation rule on each object. Packaging can't make a
lookup to User required in metadata, so the contract doesn't mark them. A blank
user fails with `FIELD_CUSTOM_VALIDATION_EXCEPTION` on `wdn_User__c`.

On Active inserts and transitions to Active, the assignment trigger clears all
three revocation fields. Component inserts, updates and deletes lock the parent
persona rows.

## Using the Warden Base app

The Warden Base app has tabs for Personas, Persona Assignments, Provisioned
Grants and Reconciliation Runs. Persona Components and Reconciliation Items have
no tab, so reach them from their parent's Related tab. Open a Persona to find its
Components, Assignments and Grants. Open a Reconciliation Run to find its Items
and the grants and assignments recorded by the run. Provisioned Grants also show
field history on their Related tab.

The Grant, Run and Item page layouts mark ledger fields read-only, except fields
that are required in metadata or by a validation rule. Those stay Required, because Salesforce does not
allow a required field to be read-only. The standard buttons stay, so Ledger
Maintenance holders can still use Delete from the UI. The layouts only control
the UI. The record guard applies to every write, including API and Apex writes,
and restricts Grant edits and deletes and Run and Item deletes. See
[Permissions and record integrity](security.md#administrators-and-the-ledger-guard).
