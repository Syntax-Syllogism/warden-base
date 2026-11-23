import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

const expectedRelatedLists = {
  wdn_Persona__c: [
    'wdn_Persona_Component__c.wdn_Persona__c',
    'wdn_Persona_Assignment__c.wdn_Persona__c',
    'wdn_Provisioned_Grant__c.wdn_Persona__c',
  ],
  wdn_Persona_Assignment__c: ['wdn_Provisioned_Grant__c.wdn_Persona_Assignment__c'],
  wdn_Provisioned_Grant__c: ['RelatedEntityHistoryList'],
  wdn_Reconciliation_Run__c: [
    'wdn_Reconciliation_Item__c.wdn_Reconciliation_Run__c',
    'wdn_Provisioned_Grant__c.wdn_Granted_By_Run__c',
    'wdn_Provisioned_Grant__c.wdn_Revoked_By_Run__c',
    'wdn_Persona_Assignment__c.wdn_Revoked_By_Run__c',
  ],
};

const validationRequiredFields = async (object) => {
  const directory = join(objectRoot, object, 'validationRules');
  if (!existsSync(directory)) return [];
  const fields = [];
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.validationRule-meta.xml'))) {
    const rule = await readMetadata(join(directory, file), 'ValidationRule');
    const match = rule.errorConditionFormula[0].trim().match(/^ISBLANK\((\w+)\)$/);
    if (rule.active[0] === 'true' && match) fields.push(match[1]);
  }
  return fields;
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
      // Salesforce forbids field permissions on required and master-detail fields.
      assert(!objects[object].fields[field].required, `${name}: ${object}.${field} is required`);
      assert(access[object]?.includes('R'));
      if (fieldPermission.editable[0] === 'true') assert(access[object].includes('E'));
    }
  }
});

test('base layouts show all fields, system information and the expected related lists with unique titles', async () => {
  const layouts = join(metadataRoot, 'ui/layouts');
  const files = readdirSync(layouts).filter((name) => name.endsWith('.layout-meta.xml'));
  assert.deepEqual(files.map((file) => file.split('-')[0]).sort(), Object.keys(expectedFields).sort());

  const ledgerObjects = new Set([
    'wdn_Provisioned_Grant__c',
    'wdn_Reconciliation_Run__c',
    'wdn_Reconciliation_Item__c',
  ]);
  for (const file of files) {
    const layout = await readMetadata(join(layouts, file), 'Layout');
    const [object] = file.split('-');
    const items = layout.layoutSections.flatMap((section) =>
      section.layoutColumns.flatMap((column) => column.layoutItems ?? []),
    );
    const fields = join(objectRoot, object, 'fields');
    const required = new Set();
    for (const fieldFile of readdirSync(fields).filter((name) => name.endsWith('.field-meta.xml'))) {
      const metadata = await readMetadata(join(fields, fieldFile), 'CustomField');
      const [field] = metadata.fullName;
      assert(
        items.some((item) => item.field?.[0] === field),
        `${file} is missing ${field}`,
      );
      if (metadata.required?.[0] === 'true' || metadata.type[0] === 'MasterDetail') required.add(field);
    }
    // A lookup to User can't be required in package metadata, so an ISBLANK validation rule enforces it.
    for (const field of await validationRequiredFields(object)) required.add(field);

    const system = layout.layoutSections.find((section) => section.label?.[0] === 'System Information');
    assert(system, `${file} is missing System Information`);
    assert.equal(system.detailHeading?.[0], 'true', file);
    assert.equal(system.editHeading?.[0], 'false', file);
    const auditFields = system.layoutColumns.flatMap((column) => column.layoutItems ?? []);
    for (const field of ['CreatedById', 'LastModifiedById']) {
      assert.equal(
        auditFields.find((item) => item.field?.[0] === field)?.behavior?.[0],
        'Readonly',
        `${file}: ${field}`,
      );
    }

    const relatedLists = new Map((layout.relatedLists ?? []).map((list) => [list.relatedList[0], list]));
    for (const name of expectedRelatedLists[object] ?? []) {
      assert(relatedLists.has(name), `${file} is missing ${name}`);
      if (name !== 'RelatedEntityHistoryList') {
        assert.equal(relatedLists.get(name).fields?.[0], 'NAME', `${file}: ${name} should start with NAME`);
      }
    }

    const relatedListTitles = new Map();
    for (const list of layout.relatedLists ?? []) {
      const [name] = list.relatedList;
      const [childObject, field] = name.split('.');
      if (!field) continue; // Standard lists such as field history have no relationship field.

      const fieldPath = join(objectRoot, childObject, 'fields', field + '.field-meta.xml');
      const metadata = await readMetadata(fieldPath, 'CustomField');
      const title = metadata.relationshipLabel?.[0];
      assert(title, `${file}: ${name} is missing a relationship label`);
      assert(!relatedListTitles.has(title), `${file}: ${relatedListTitles.get(title)} and ${name} both use "${title}"`);
      relatedListTitles.set(title, name);
    }

    for (const item of items) {
      const field = item.field?.[0];
      const behavior = item.behavior?.[0];
      if (ledgerObjects.has(object) && field) {
        assert.equal(behavior, required.has(field) ? 'Required' : 'Readonly', `${file}: ${field}`);
      }
      if (behavior === 'Required' && field !== 'Name') {
        assert(required.has(field), `${file}: ${field} is Required on the layout but optional in metadata`);
      }
    }
    if (ledgerObjects.has(object)) {
      assert.equal(layout.excludeButtons, undefined, `${file} should keep its standard buttons`);
    }
  }
});

test('all Apex metadata uses the project API version', async () => {
  const { sourceApiVersion } = JSON.parse(readFileSync(new URL('../../sfdx-project.json', import.meta.url), 'utf8'));
  const base = join(metadataRoot, '..');
  for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
    const match = entry.name.match(/\.(cls|trigger)-meta\.xml$/);
    if (!entry.isFile() || !match) continue;
    const metadata = await readMetadata(
      join(entry.parentPath, entry.name),
      match[1] === 'cls' ? 'ApexClass' : 'ApexTrigger',
    );
    assert.equal(metadata.apiVersion[0], sourceApiVersion, entry.name);
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

test('lookups to User never use Restrict or Cascade, which packaging rejects', async () => {
  for (const entry of readdirSync(objectRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.field-meta.xml')) continue;
    const field = await readMetadata(join(entry.parentPath, entry.name), 'CustomField');
    if (field.type?.[0] !== 'Lookup' || field.referenceTo?.[0] !== 'User') continue;
    assert(
      !['Restrict', 'Cascade'].includes(field.deleteConstraint?.[0]),
      `${entry.name}: a User lookup cannot use ${field.deleteConstraint?.[0]}`,
    );
  }
});

test('the User lookups stay optional in metadata and an active validation rule requires them', async () => {
  for (const object of ['wdn_Persona_Assignment__c', 'wdn_Provisioned_Grant__c']) {
    const field = await readMetadata(join(objectRoot, object, 'fields/wdn_User__c.field-meta.xml'), 'CustomField');
    assert.equal(field.required[0], 'false', object);
    assert.deepEqual(await validationRequiredFields(object), ['wdn_User__c'], object);
  }
});
