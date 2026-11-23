import { soqlLiteral } from './apex.mjs';

// Assigning a permission set the user already holds fails with
// "Duplicate PermissionSetAssignment", so a reused evidence org needs these.
export function missingPermissionSets(soql, username, names) {
  if (!names.length) return [];
  const held = new Set(
    soql(
      `SELECT PermissionSet.Name FROM PermissionSetAssignment WHERE Assignee.Username = ${soqlLiteral(username)} AND PermissionSet.Name IN (${names.map(soqlLiteral).join(', ')})`,
    ).map((row) => row.PermissionSet?.Name),
  );
  return names.filter((name) => !held.has(name));
}

export const PUBLISHER = 'wdn_Persona_Publisher';
export const INTEGRATION = 'wdn_Integration';
export const MAINTENANCE = 'wdn_Ledger_Maintenance';
export const BASE_PERMISSION_SETS = [PUBLISHER, INTEGRATION, MAINTENANCE, 'wdn_Base_Viewer'];

export function withPermissionSet(ctx, key, name, action) {
  const username = ctx.user(key);
  if (!username) throw new Error(`Missing authenticated identity ${key}`);
  const assignments = () =>
    ctx.soql(
      `SELECT Id, PermissionSet.Name FROM PermissionSetAssignment WHERE Assignee.Username = ${soqlLiteral(username)} AND PermissionSet.Name IN (${BASE_PERMISSION_SETS.map(soqlLiteral).join(', ')})`,
    );
  if (assignments().length) throw new Error(`${key} already holds a Warden Base permission set`);
  let assignmentId;
  let result;
  let primaryFailure;
  try {
    ctx.sfJson(['org', 'assign', 'permset', '--name', name, '--on-behalf-of', username]);
    const held = assignments();
    if (held.length !== 1 || held[0].PermissionSet?.Name !== name) {
      throw new Error(`${key} did not receive ${name} in isolation`);
    }
    assignmentId = held[0].Id;
    result = action();
  } catch (error) {
    primaryFailure = { error };
  }

  try {
    const remove = assignmentId
      ? [assignmentId]
      : assignments()
          .filter((entry) => entry.PermissionSet?.Name === name)
          .map((entry) => entry.Id);
    for (const id of remove) {
      ctx.sfJson(['data', 'delete', 'record', '--sobject', 'PermissionSetAssignment', '--record-id', id]);
    }
    if (assignments().length) throw new Error(`Expected no Warden Base permission sets for ${key} after cleanup`);
  } catch (error) {
    if (primaryFailure) {
      throw new AggregateError(
        [primaryFailure.error, error],
        `Permission set action and cleanup both failed for ${key}`,
        { cause: primaryFailure.error },
      );
    }
    throw error;
  }
  if (primaryFailure) throw primaryFailure.error;
  return result;
}

// The shipped Integration permission set grants no Delete on ledger objects, so
// a delete as that user fails on object permissions and never reaches the
// ledger guard. To exercise the guard, delete probes also hold this org-only
// permission set. The harness creates it in the evidence org; it is never
// packaged and grants no Ledger Maintenance, View All or Modify All.
export const DELETE_PROBE = 'Warden_Evidence_Delete_Probe';
export const LEDGER_OBJECTS = ['wdn_Reconciliation_Run__c', 'wdn_Reconciliation_Item__c', 'wdn_Provisioned_Grant__c'];

const createRecord = (ctx, sobject, values) =>
  ctx.sfJson(['data', 'create', 'record', '--sobject', sobject, '--values', values]).result.id;

export function ensureDeleteProbe(ctx) {
  const [existing] = ctx.soql(`SELECT Id FROM PermissionSet WHERE Name = ${soqlLiteral(DELETE_PROBE)}`);
  if (existing) return existing.Id;
  const id = createRecord(ctx, 'PermissionSet', `Name=${DELETE_PROBE} Label='Warden Evidence Delete Probe'`);
  for (const object of LEDGER_OBJECTS) {
    createRecord(
      ctx,
      'ObjectPermissions',
      `ParentId=${id} SobjectType=${object} PermissionsRead=true PermissionsEdit=true PermissionsDelete=true`,
    );
  }
  return id;
}

export function integrationDeletableObjects(ctx) {
  return ctx
    .soql(
      `SELECT SobjectType FROM ObjectPermissions WHERE Parent.Name = ${soqlLiteral(INTEGRATION)} AND PermissionsDelete = true AND SobjectType IN (${LEDGER_OBJECTS.map(soqlLiteral).join(', ')})`,
    )
    .map((row) => row.SobjectType);
}

export function withDeleteProbe(ctx, userId, action) {
  const permissionSetId = ensureDeleteProbe(ctx);
  const assignmentId = createRecord(
    ctx,
    'PermissionSetAssignment',
    `AssigneeId=${userId} PermissionSetId=${permissionSetId}`,
  );
  try {
    return action();
  } finally {
    ctx.sfJson(['data', 'delete', 'record', '--sobject', 'PermissionSetAssignment', '--record-id', assignmentId]);
  }
}
