# Permissions and record integrity

Assign permission sets by job. Salesforce permissions are additive, so a
user who imports personas and records provisioning runs can hold both CLI
permission sets.

| Permission set           | Use                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wdn_Integration`        | Record provision and strip activity in runs, items and grants. Read persona definitions. Update assignment status and revocation fields.                                   |
| `wdn_Persona_Publisher`  | Upsert personas and create, edit or delete their components.                                                                                                               |
| `wdn_Base_Viewer`        | Read all six objects through normal record sharing. Includes access to the Warden Base app and tabs.                                                                       |
| `wdn_Ledger_Maintenance` | Correct grants and purge grants, runs and items. Includes View All on those three objects and the custom permission needed to bypass the record guard. Assign temporarily. |

## Administrators and the ledger guard

Installing Warden Base with `AdminsOnly` grants the Ledger Maintenance custom
permission to the System Administrator profile. System Administrators are
trusted to bypass the ledger guard. The guard protects ledger records from
non-admin operators and integrations that lack Ledger Maintenance.

An `AllUsers` install grants `wdn_Ledger_Maintenance` to every profile. Every
user can then bypass the ledger guard if they have access to the operation.
Use `AdminsOnly` and assign Warden Base permission sets by job. See the
[install security evidence catalog](evidence/README.md#0102).

The guard blocks grant deletion and protects every stored Grant field, including
standard fields such as the owner, except the revocation date and revoking run.
Formula and auto-number fields are not compared.
A caller can set those two fields together once. Run and item updates are
allowed so callers can fill in the audit outcome. Run and item deletion requires
Ledger Maintenance. The custom permission bypasses the guard, while Salesforce
lookup restrictions still apply.

These sets control access to Warden records. The acting Salesforce user also
needs the Salesforce permissions for any grants the CLI will manage, such as
permission-set assignments or group membership.

## Broad permissions

No shipped permission set enables the system-wide `ModifyAllData`,
`ViewAllData`, `ModifyMetadata` or `CustomizeApplication` permissions. The
[metadata test](development.md#changing-metadata) fails if one does.

Object-level Modify All and View All belong on admin-type permission sets, such
as Ledger Maintenance, which is the only shipped set that grants View All. A
non-admin set that grants either must say why in its `<description>`, or drop
the grant.
