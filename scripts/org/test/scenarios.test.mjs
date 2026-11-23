import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import smoke from '../scenarios/install-smoke.mjs';
import upgrade from '../scenarios/install-upgrade.mjs';
import ledgerLifecycle, { maintenancePurge } from '../scenarios/ledger-lifecycle.mjs';
import security from '../scenarios/install-security.mjs';
import { readContract } from '../lib/install.mjs';
import { testIdentities } from '../lib/fixtures.mjs';
import { BASE_PERMISSION_SETS, INTEGRATION, MAINTENANCE, PUBLISHER, withPermissionSet } from '../lib/permsets.mjs';
import { SfError } from '../lib/sf.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const contract = readContract(root);
const packageId = '04tfj000000mt2DAAQ';
const upgradeFrom = '04tfj000000mpEjAAI';
const personaId = 'a00000000000001AAA';
const assignmentId = 'a01000000000001AAA';
const runId = 'a02000000000001AAA';
const itemId = 'a03000000000001AAA';
const grantId = 'a04000000000001AAA';
const userId = '005000000000001AAA';
const orgId = '00D000000000001AAA';

function context(securityType = 'AdminsOnly') {
  const artifacts = new Map();
  const checks = [];
  const metrics = {};
  const ctx = {
    root,
    packageId,
    upgradeFrom,
    securityType,
    state: {},
    orgInfo: { id: orgId },
    metrics,
    artifact: (name, value) => artifacts.set(name, value),
    check: (name, passed, detail) => checks.push({ name, passed, detail }),
    block: (name, detail) => checks.push({ name, outcome: 'blocked', detail }),
    metric: (name, value) => {
      metrics[name] = value;
    },
    user: (key) => (key === 'base-integration' ? 'operator@example.test' : undefined),
  };
  return { artifacts, checks, ctx, metrics };
}

function installed(id) {
  return {
    result: [
      { SubscriberPackageName: 'Other', SubscriberPackageVersionId: 'other' },
      {
        SubscriberPackageName: 'warden-base',
        SubscriberPackageVersionId: id,
        SubscriberPackageVersionNumber: '0.1.0.2',
      },
    ],
  };
}

test('withPermissionSet reports action and cleanup errors together when both fail', () => {
  const { ctx } = context();
  const actionError = new Error('action failed');
  const cleanupError = new Error('permission set removal failed');
  let held = [];
  ctx.soql = () => held;
  ctx.sfJson = (args) => {
    if (args[0] === 'org') {
      held = [{ Id: assignmentId, PermissionSet: { Name: INTEGRATION } }];
      return;
    }
    assert.deepEqual(args, [
      'data',
      'delete',
      'record',
      '--sobject',
      'PermissionSetAssignment',
      '--record-id',
      assignmentId,
    ]);
    throw cleanupError;
  };

  assert.throws(
    () =>
      withPermissionSet(ctx, 'base-integration', INTEGRATION, () => {
        throw actionError;
      }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause, actionError);
      assert.deepEqual(error.errors, [actionError, cleanupError]);
      return true;
    },
  );
});

test('ledger-lifecycle rejects AllUsers before checking the installed version', () => {
  const { ctx } = context('AllUsers');
  const sfJson = test.mock.fn(() => installed(packageId));
  ctx.sfJson = sfJson;

  assert.throws(() => ledgerLifecycle.setup(ctx), /ledger-lifecycle requires --security-type AdminsOnly/);
  assert.equal(sfJson.mock.callCount(), 0);
});

function describe(name) {
  const types = {
    AutoNumber: 'string',
    Text: 'string',
    Lookup: 'reference',
    MasterDetail: 'reference',
    DateTime: 'datetime',
    Picklist: 'picklist',
    Checkbox: 'boolean',
    LongTextArea: 'textarea',
    Number: 'double',
  };
  const object = contract.objects[name];
  return {
    fields: Object.entries(object.fields).map(([field, info]) => ({
      name: field,
      type: types[info.type],
      autoNumber: info.type === 'AutoNumber',
      referenceTo: info.referenceTo ? [info.referenceTo] : [],
      picklistValues: info.values?.map((value) => ({ active: true, value })),
    })),
    childRelationships: Object.entries(object.childRelationships).map(([relationshipName, childSObject]) => {
      const [field, info] = Object.entries(contract.objects[childSObject].fields).find(
        ([, meta]) => meta.referenceTo === name && meta.relationshipName + '__r' === relationshipName,
      );
      return { relationshipName, childSObject, field, cascadeDelete: info.type === 'MasterDetail' };
    }),
  };
}

test('install-smoke accepts matching describes and reports field, picklist, reference and relationship drift', () => {
  for (const drift of [false, true]) {
    const { ctx, artifacts, checks } = context();
    ctx.sfJson = (args) => {
      if (args.join(' ') === 'package installed list') return installed(packageId.slice(0, 15));
      assert.deepEqual(args.slice(0, 3), ['sobject', 'describe', '--sobject']);
      const result = describe(args[3]);
      if (drift && args[3] === 'wdn_Persona_Assignment__c') {
        result.fields = result.fields.filter((field) => field.name !== 'wdn_Revoked_On__c');
        result.fields.find((field) => field.name === 'wdn_Status__c').picklistValues.pop();
        result.fields.find((field) => field.name === 'wdn_User__c').referenceTo = ['Contact'];
        result.childRelationships = [];
      }
      if (drift && args[3] === 'wdn_Persona__c') {
        result.childRelationships.find((child) => child.relationshipName === 'wdn_PersonaComponents__r').cascadeDelete =
          false;
      }
      return { result };
    };
    ctx.soql = (query) =>
      query.includes('FROM CustomPermission')
        ? [{ DeveloperName: MAINTENANCE }]
        : BASE_PERMISSION_SETS.map((Name) => ({ Name }));
    assert.equal(smoke.setup(ctx), true);
    assert.equal(smoke.verify(ctx), !drift);
    assert.equal(checks.at(-1).passed, !drift);
    assert.deepEqual(
      artifacts.get('scenario/contract-diff.json').map((diff) => diff.path),
      drift
        ? [
            'wdn_Persona_Assignment__c.wdn_Revoked_On__c',
            'wdn_Persona_Assignment__c.wdn_Status__c.values',
            'wdn_Persona_Assignment__c.wdn_User__c.referenceTo',
            'wdn_Persona_Assignment__c.childRelationships.wdn_AssignmentProvisionedGrants__r',
            'wdn_Persona_Component__c.wdn_Persona__c.type',
          ]
        : [],
    );
  }
});

function mockSmokeWrites(ctx) {
  const ran = [];
  let held;
  let probe = false;
  ctx.soql = (query) =>
    query.includes('FROM SetupEntityAccess') || query.includes('FROM ObjectPermissions')
      ? []
      : query.includes('FROM PermissionSet WHERE Name')
        ? [{ Id: 'probe-permset' }]
        : query.includes('FROM PermissionSetAssignment')
          ? held
            ? [{ Id: 'assignment', PermissionSet: { Name: held } }]
            : []
          : [{ Id: userId }];
  ctx.sfJson = (args) => {
    if (args[1] === 'create') {
      assert.deepEqual(args.slice(0, 5), ['data', 'create', 'record', '--sobject', 'PermissionSetAssignment']);
      assert.match(args[6], /PermissionSetId=probe-permset$/);
      probe = true;
      return { result: { id: 'probe-assignment' } };
    }
    if (args.includes('probe-assignment')) {
      probe = false;
      return;
    }
    if (args[1] === 'assign') {
      assert.equal(held, undefined);
      held = args[args.indexOf('--name') + 1];
    } else {
      assert.equal(args[1], 'delete');
      held = undefined;
    }
  };
  ctx.runAnonymous = (source, options) => {
    ran.push({ source, asUser: options?.asUser, held, probe });
    return {
      logs: [
        ['PERSONA', personaId],
        ['ASSIGNMENT', assignmentId],
        ['RUN', runId],
        ['ITEM', itemId],
        ['GRANT', grantId],
      ]
        .map(([key, id]) => `|DEBUG|${key}=${id}`)
        .join('\n'),
    };
  };
  return { ran, permissionSet: () => held };
}

test('install-smoke isolates CLI permissions and exercises user mode writes and the guard', () => {
  const { ctx, checks, artifacts } = context();
  const { ran, permissionSet } = mockSmokeWrites(ctx);
  smoke.run(ctx);
  assert.deepEqual(
    ran.map((call) => call.held),
    [PUBLISHER, PUBLISHER, undefined, INTEGRATION, INTEGRATION, INTEGRATION],
  );
  assert.equal(ran[2].asUser, undefined);
  assert.ok(
    ran
      .filter((call) => call.held)
      .every((call) => call.asUser === 'base-integration' && call.source.includes('USER_MODE')),
  );
  assert.match(ran.at(-1).source, /Database\.delete\(guardProbe, false\);/);
  // Only the delete probe holds the org-only Delete permission set.
  assert.deepEqual(
    ran.map((call) => call.probe),
    [false, false, false, false, false, true],
  );
  // Anonymous Apex rejects an explicit system access level, and non-admin
  // users cannot call FeatureManagement or UserInfo there.
  assert.ok(ran.every((call) => !/SYSTEM_MODE|\bas system\b|FeatureManagement|UserInfo/i.test(call.source)));
  // wdn_Target_Id__c is an 18-character ID field.
  const targetIds = ran.flatMap((call) =>
    [...call.source.matchAll(/wdn_Target_Id__c'?\s*[=,]\s*'([^']*)'/g)].map((match) => match[1]),
  );
  assert.ok(targetIds.length >= 2 && targetIds.every((id) => id.length <= 18), targetIds.join(', '));
  assert.equal(permissionSet(), undefined);
  assert.equal(artifacts.get('scenario/smoke.json').grantId, grantId);
  assert.ok(checks.every((check) => check.passed));
});

test('identity selection prefers available Platform seats and can reuse one Salesforce seat', () => {
  for (const seats of [0, 2]) {
    const { ctx } = context();
    ctx.soql = (query) =>
      query.includes('FROM UserLicense')
        ? [
            { Name: 'Salesforce', TotalLicenses: 2, UsedLicenses: 1 },
            { Name: 'Salesforce Platform', TotalLicenses: seats, UsedLicenses: 0 },
          ]
        : [];
    assert.deepEqual(
      testIdentities(ctx, true).map(({ license }) => license),
      seats ? ['Salesforce Platform', 'Salesforce Platform'] : ['Salesforce'],
    );
  }
});

test('install-upgrade records an explicit beta refusal as blocked and propagates unrelated failures', () => {
  const { artifacts, checks, ctx } = context();
  const message = 'You cannot upgrade a beta package. Uninstall the existing version first.';
  ctx.sfJson = (args) => {
    assert.deepEqual(args.slice(0, 4), ['package', 'install', '--package', upgradeFrom]);
    throw new SfError({ status: 1, message });
  };
  assert.equal(upgrade.deploy(ctx), false);
  assert.equal(artifacts.get('scenario/install-predecessor.json').message, message);
  assert.equal(checks[0].outcome, 'blocked');
  ctx.sfJson = () => {
    throw new SfError({ status: 1, message: 'Network timeout' });
  };
  assert.throws(() => upgrade.deploy(ctx), /Network timeout/);
});

test('install-upgrade starts from the captured IDs and reports lost rows or a blocked upgrade', () => {
  const itemObject = 'wdn_Reconciliation_Item__c';
  for (const outcome of ['preserved', 'lost', 'blocked']) {
    const { ctx, artifacts, checks } = context();
    mockSmokeWrites(ctx);
    const permissionCall = ctx.sfJson;
    const permissionQuery = ctx.soql;
    let version = upgradeFrom;
    ctx.sfJson = (args) => {
      if (args.slice(0, 2).join(' ') === 'package install') {
        if (outcome === 'blocked') {
          return { result: { Status: 'ERROR', Errors: ['You cannot upgrade a beta package.'] } };
        }
        version = args[3];
        return { result: { Status: 'SUCCESS' } };
      }
      if (args[1] === 'installed') return installed(version);
      if (args[1] === 'describe') return { result: describe(args[3]) };
      return permissionCall(args);
    };
    ctx.soql = (query) => {
      if (!query.endsWith('ORDER BY Id')) return permissionQuery(query);
      return query.includes(itemObject) && version === packageId && outcome === 'lost' ? [] : [{ Id: itemId }];
    };
    assert.equal(upgrade.setup(ctx), true);
    assert.equal(upgrade.run(ctx), outcome !== 'blocked');
    assert.deepEqual(artifacts.get('scenario/data-before.json')[itemObject], [itemId]);
    if (outcome === 'blocked') {
      assert.equal(checks.at(-1).outcome, 'blocked');
      assert.deepEqual(artifacts.get('scenario/upgrade.json').detail.Errors, ['You cannot upgrade a beta package.']);
      continue;
    }
    upgrade.verify(ctx);
    assert.equal(checks.find(({ name }) => name.startsWith(itemObject)).passed, outcome === 'preserved');
    assert.equal(artifacts.get('scenario/smoke-after.json').grantId, grantId);
  }
});

test('maintenance permissions are removed and checked after the purge fails', () => {
  const { ctx } = context();
  let held = false;
  const calls = [];
  ctx.soql = () => (held ? [{ Id: 'maintenance-psa', PermissionSet: { Name: MAINTENANCE } }] : []);
  ctx.sfJson = (args) => {
    calls.push(args);
    held = args[0] === 'org';
  };
  ctx.runAnonymous = (source, { asUser }) => {
    assert.equal(asUser, 'base-integration');
    assert.ok(held);
    assert.match(source, /Database.delete/);
    throw new Error('purge failed');
  };
  assert.throws(() => maintenancePurge(ctx, { grantId, runId }), /purge failed/);
  assert.deepEqual(
    calls.map((args) => args.slice(0, 3)),
    [
      ['org', 'assign', 'permset'],
      ['data', 'delete', 'record'],
    ],
  );
  assert.ok(!held);
});

test('install-security records profile and object access and fails a custom-permission grant mismatch', () => {
  const profiles = ['Standard User', 'System Administrator'];
  for (const [securityType, granted, passes] of [
    ['AdminsOnly', ['System Administrator'], true],
    ['AllUsers', profiles, true],
    ['AllUsers', ['System Administrator'], false],
    ['AdminsOnly', profiles, false],
  ]) {
    const { ctx, artifacts, checks, metrics } = context(securityType);
    ctx.sfJson = () => installed(packageId);
    ctx.soql = (query) => {
      if (query.includes('FROM Profile')) return profiles.map((Name) => ({ Name }));
      if (query.includes('FROM SetupEntityAccess')) {
        return [
          ...granted.map((Name) => ({ Parent: { Profile: { Name }, IsOwnedByProfile: true } })),
          { Parent: { Name: MAINTENANCE, IsOwnedByProfile: false } },
        ];
      }
      assert.match(query, /FROM ObjectPermissions/);
      assert.ok(Object.keys(contract.objects).every((name) => query.includes(name)));
      return [...profiles].reverse().map((Name) => ({
        Parent: { Profile: { Name } },
        SobjectType: 'wdn_Persona__c',
        PermissionsRead: true,
      }));
    };
    assert.equal(security.setup(ctx), true);
    security.run(ctx);
    security.verify(ctx);
    assert.equal(checks.at(-1).passed, passes);
    assert.equal(metrics.profiles, 2);
    assert.equal(artifacts.get('scenario/custom-permission-grants.json').length, granted.length + 1);
    assert.deepEqual(
      artifacts.get('scenario/object-permissions.json').map(({ profile }) => profile),
      profiles,
    );
    if (!passes) assert.match(checks.at(-1).detail, /Standard User/);
  }
});
