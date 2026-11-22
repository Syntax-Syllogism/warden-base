import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { generateContract, metadataRoot, objectRoot, permissionRoot, readMetadata } from '../contract.mjs';

const expectedFields = {
  wdn_Persona__c: 'Api_Name Active',
  wdn_Persona_Component__c: 'Persona Type Reference',
  wdn_Persona_Assignment__c: 'User Persona Status Revoked_On Revoked_By Revoked_By_Run',
  wdn_Provisioned_Grant__c:
    'User Type Target_Id Target_Label Granted_On Granted_By_Run Revoked_On Revoked_By_Run Persona_Assignment Persona',
  wdn_Reconciliation_Run__c:
    'Mode Scope Planned_Count Applied_Count Error_Count Unmanaged_Count Source_System Cli_Version Invoking_User Ci_Job Definition_Path Definition_Sha',
  wdn_Reconciliation_Item__c: 'Reconciliation_Run User_Key User_Id Category Action Status Detail Error',
};

test('the checked-in contract describes the six base objects and their fields', async () => {
  const contract = JSON.parse(readFileSync(new URL('../../contract.json', import.meta.url), 'utf8'));
  assert.deepEqual(contract, await generateContract());
  assert.deepEqual(Object.keys(contract.objects).sort(), Object.keys(expectedFields).sort());

  for (const [object, expected] of Object.entries(expectedFields)) {
    const fieldNames = expected.split(' ').map((name) => `wdn_${name}__c`);
    const directory = join(objectRoot, object, 'fields');
    assert.deepEqual(readdirSync(directory).sort(), fieldNames.map((name) => name + '.field-meta.xml').sort());
    assert.deepEqual(Object.keys(contract.objects[object].fields).sort(), ['Name', ...fieldNames.sort()]);
  }
  assert.equal(
    contract.objects.wdn_Reconciliation_Run__c.childRelationships.wdn_ReconciliationItems__r,
    'wdn_Reconciliation_Item__c',
  );
  assert.equal(contract.objects.wdn_Persona__c.childRelationships.Provisioned_Grants__r, 'wdn_Provisioned_Grant__c');

  const runModes = contract.objects.wdn_Reconciliation_Run__c.fields.wdn_Mode__c.values;
  assert.equal(runModes.length, 5);
  assert(runModes.includes('Drift') && runModes.includes('Revoke Preview'));
  const itemStatuses = contract.objects.wdn_Reconciliation_Item__c.fields.wdn_Status__c.values;
  assert.equal(itemStatuses.length, 6);
  assert(itemStatuses.includes('Kept') && itemStatuses.includes('Skipped'));
});

test('base source contains no extension-only names', () => {
  const extensionOnly =
    /\bwdn_(?:Description__c|Requestable__c|Approver_Group__c|Approve_In_Order__c|Resolved_Id__c|Resolution_Status__c|Access_Request\w*|Source__c|Justification__c|Last_Reconciled__c|Provenance__c|Applied_On__c|Backfill_Count__c|Bookkeeping_Status__c|Last_Error__c|Freeze__c|Deactivate__c|Revoke_Kind__c|Record_Id__c|Request_Decision\w*|Persona_Approval_Stage\w*|ReconcilerService|PersonaComponentTriggerHandler|AppFactory|Admin)\b/;
  const base = join(metadataRoot, '..');
  for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    assert.doesNotMatch(file, extensionOnly);
    assert.doesNotMatch(readFileSync(file, 'utf8'), extensionOnly, file);
  }
  // Target_Id exists on Grant. Its extension-only use is on Item.
  const itemTarget = /\bwdn_Reconciliation_Item__(?:c|r)\.wdn_Target_Id__c\b/;
  for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) assert.doesNotMatch(readFileSync(join(entry.parentPath, entry.name), 'utf8'), itemTarget);
  }
});

test('shipped permission sets do not enable broad system permissions', async () => {
  const broadPermissions = new Set(['ModifyAllData', 'ViewAllData', 'ModifyMetadata', 'CustomizeApplication']);
  const source = new URL('../../sfdx-source/', import.meta.url);
  for (const entry of readdirSync(source, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.permissionset-meta.xml')) {
      continue;
    }
    const permissionSet = await readMetadata(join(entry.parentPath, entry.name), 'PermissionSet');
    for (const permission of permissionSet.userPermissions ?? []) {
      const [name] = permission.name;
      const enabled = permission.enabled[0] === 'true' || permission.enabled[0] === '1';
      assert(!(enabled && broadPermissions.has(name)), `${entry.name} enables ${name}`);
    }
  }
});

test('the four permission sets grant valid fields and the expected object access', async () => {
  const { objects, permissionSets } = await generateContract();
  const { wdn_Integration, wdn_Persona_Publisher, wdn_Ledger_Maintenance, wdn_Base_Viewer } = permissionSets;
  assert.equal(Object.keys(permissionSets).length, 4);
  assert.deepEqual(wdn_Integration, {
    wdn_Persona__c: 'R',
    wdn_Persona_Component__c: 'R',
    wdn_Persona_Assignment__c: 'RE',
    wdn_Provisioned_Grant__c: 'CRE',
    wdn_Reconciliation_Run__c: 'CRE',
    wdn_Reconciliation_Item__c: 'CRE',
  });
  assert.deepEqual(wdn_Persona_Publisher, { wdn_Persona__c: 'CRE', wdn_Persona_Component__c: 'CRED' });
  assert.deepEqual(wdn_Ledger_Maintenance, {
    wdn_Provisioned_Grant__c: 'CRED',
    wdn_Reconciliation_Run__c: 'CRED',
    wdn_Reconciliation_Item__c: 'CRED',
  });
  assert.deepEqual(wdn_Base_Viewer, Object.fromEntries(Object.keys(objects).map((object) => [object, 'R'])));

  for (const [name, access] of Object.entries(permissionSets)) {
    const permission = await readMetadata(join(permissionRoot, name + '.permissionset-meta.xml'), 'PermissionSet');
    for (const fieldPermission of permission.fieldPermissions ?? []) {
      const [object, field] = fieldPermission.field[0].split('.');
      assert(Object.hasOwn(objects[object]?.fields ?? {}, field), `${name}: ${object}.${field}`);
      assert(access[object]?.includes('R'));
      if (fieldPermission.editable[0] === 'true') assert(access[object].includes('E'));
    }
  }
});

test('new grant Persona lookup restricts deletion and stays inside the history tracking limit', async () => {
  const grant = join(objectRoot, 'wdn_Provisioned_Grant__c');
  const lookup = await readMetadata(join(grant, 'fields/wdn_Persona__c.field-meta.xml'), 'CustomField');
  assert.equal(lookup.referenceTo[0], 'wdn_Persona__c');
  assert.equal(lookup.deleteConstraint[0], 'Restrict');
  assert.equal(lookup.required[0], 'false');
  assert.equal(lookup.trackHistory[0], 'true');
  const tracked = await Promise.all(
    readdirSync(join(grant, 'fields')).map((file) => readMetadata(join(grant, 'fields', file), 'CustomField')),
  );
  assert(tracked.filter((field) => field.trackHistory?.[0] === 'true').length <= 20);
});
