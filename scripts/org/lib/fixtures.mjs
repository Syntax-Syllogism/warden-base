import { randomUUID } from 'node:crypto';
import { soqlLiteral } from './apex.mjs';
import { usernameFor } from './identities.mjs';
import {
  INTEGRATION,
  integrationDeletableObjects,
  MAINTENANCE,
  PUBLISHER,
  withDeleteProbe,
  withPermissionSet,
} from './permsets.mjs';

export const INTEGRATION_KEY = 'base-integration';
const PUBLISHER_KEY = 'base-publisher';
export const GUARD_MESSAGE = 'Warden operational records can only be changed with the Ledger Maintenance permission.';

export function testIdentities(ctx, includePublisher = false) {
  const keys = includePublisher ? [INTEGRATION_KEY, PUBLISHER_KEY] : [INTEGRATION_KEY];
  const profiles = [
    { profile: 'Standard Platform User', license: 'Salesforce Platform' },
    { profile: 'Standard User', license: 'Salesforce' },
  ];
  const licenses = ctx.soql(
    "SELECT Name, TotalLicenses, UsedLicenses FROM UserLicense WHERE Name IN ('Salesforce Platform', 'Salesforce')",
  );
  ctx.metric(
    'userLicenses',
    licenses.map(({ Name, TotalLicenses, UsedLicenses }) => ({ Name, TotalLicenses, UsedLicenses })),
  );
  const usernames = keys.map((key) => usernameFor(key, ctx.orgInfo.id));
  const existing = ctx.soql(
    `SELECT Username, Profile.Name FROM User WHERE Username IN (${usernames.map(soqlLiteral).join(', ')})`,
  );
  const available = new Map(licenses.map((row) => [row.Name, row.TotalLicenses - row.UsedLicenses]));
  const specs = [];
  for (const [index, key] of keys.entries()) {
    const user = existing.find((row) => row.Username === usernames[index]);
    const profile = user
      ? profiles.find((entry) => entry.profile === user.Profile.Name)
      : profiles.find((entry) => available.get(entry.license) > 0);
    if (!profile) {
      if (user || index === 0) throw new Error(`No supported profile or available license for ${key}`);
      continue;
    }
    if (!user) available.set(profile.license, available.get(profile.license) - 1);
    specs.push({ key, ...profile });
  }
  ctx.metric('publisherIdentity', includePublisher ? (specs.length === 2 ? PUBLISHER_KEY : INTEGRATION_KEY) : null);
  return specs;
}

function logId(result, key) {
  const id = result.logs?.match(new RegExp(`\\|DEBUG\\|${key}=([a-zA-Z0-9]{15,18})\\b`))?.[1];
  if (!id) throw new Error(`Anonymous Apex did not log ${key}`);
  return id;
}

export function identityId(ctx, key) {
  const row = ctx.soql(`SELECT Id FROM User WHERE Username = ${soqlLiteral(ctx.user(key))}`)[0];
  if (!row) throw new Error(`User record missing for ${key}`);
  return row.Id;
}

// Anonymous Apex run by these non-admin identities throws "Required
// permissions are not enabled" on FeatureManagement and UserInfo calls. So the
// harness passes user IDs in as literals and checks Ledger Maintenance from
// the admin connection.
export function holdsMaintenance(ctx, key) {
  const rows = ctx.soql(
    `SELECT Id FROM SetupEntityAccess WHERE SetupEntityId IN (SELECT Id FROM CustomPermission WHERE DeveloperName = ${soqlLiteral(MAINTENANCE)}) AND ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = ${soqlLiteral(identityId(ctx, key))})`,
  );
  return rows.length > 0;
}

export function assertNoMaintenance(ctx, key) {
  if (holdsMaintenance(ctx, key)) throw new Error(`${key} unexpectedly holds ${MAINTENANCE}`);
}

// wdn_Target_Id__c holds a Salesforce ID (18 characters), so keep the unique
// tail of the evidence name.
export const targetIdFor = (name) => name.slice(-18);

export function seedLedger(ctx, { name, assignmentId = null, personaId = null }) {
  assertNoMaintenance(ctx, INTEGRATION_KEY);
  const source = ctx.runAnonymous(
    `
    wdn_Reconciliation_Run__c run = new wdn_Reconciliation_Run__c(wdn_Mode__c='Apply', wdn_Source_System__c='CLI');
    Database.insert(run, true, AccessLevel.USER_MODE);
    wdn_Reconciliation_Item__c item = new wdn_Reconciliation_Item__c(wdn_Reconciliation_Run__c=run.Id, wdn_User_Key__c='${name}', wdn_Status__c='Planned');
    Database.insert(item, true, AccessLevel.USER_MODE);
    wdn_Provisioned_Grant__c grant = new wdn_Provisioned_Grant__c(
      wdn_Target_Id__c=${soqlLiteral(targetIdFor(name))}, wdn_Target_Label__c='Org evidence', wdn_Type__c='Permission Set',
      wdn_User__c=${soqlLiteral(identityId(ctx, INTEGRATION_KEY))}, wdn_Granted_By_Run__c=run.Id, wdn_Granted_On__c=System.now(),
      wdn_Persona_Assignment__c=${assignmentId ? soqlLiteral(assignmentId) : 'null'},
      wdn_Persona__c=${personaId ? soqlLiteral(personaId) : 'null'});
    Database.insert(grant, true, AccessLevel.USER_MODE);
    System.debug('RUN=' + run.Id);
    System.debug('ITEM=' + item.Id);
    System.debug('GRANT=' + grant.Id);
  `,
    { asUser: INTEGRATION_KEY },
  );
  return { runId: logId(source, 'RUN'), itemId: logId(source, 'ITEM'), grantId: logId(source, 'GRANT') };
}

// Anonymous Apex rejects an explicit AccessLevel.SYSTEM_MODE or `as system`, and
// deletes without an access level still need object Delete permission. So
// deletes run with the org-only delete probe on top of Integration, after
// checking from the admin connection that Integration itself grants no Delete.
export function guardedDml(ctx, { label, operation, record, mode, prepare = '', finish = '' }) {
  const resultType = operation === 'delete' ? 'DeleteResult' : 'SaveResult';
  const access = mode ? `, AccessLevel.${mode}` : '';
  assertNoMaintenance(ctx, INTEGRATION_KEY);
  const run = () =>
    ctx.runAnonymous(
      `
    ${prepare}
    Database.${resultType} result = Database.${operation}(${record}, false${access});
    System.assertEquals(false, result.isSuccess());
    System.assertEquals(${soqlLiteral(GUARD_MESSAGE)}, result.getErrors()[0].getMessage());
    ${finish}
  `,
      { asUser: INTEGRATION_KEY },
    );
  if (operation === 'delete') {
    const deletable = integrationDeletableObjects(ctx);
    if (deletable.length) throw new Error(`${INTEGRATION} grants Delete on ${deletable.join(', ')}`);
    withDeleteProbe(ctx, identityId(ctx, INTEGRATION_KEY), run);
  } else {
    run();
  }
  ctx.check(label, true, GUARD_MESSAGE);
}

export function guardedRunDelete(ctx, label) {
  guardedDml(ctx, {
    label,
    operation: 'delete',
    record: 'guardProbe',
    prepare: `Savepoint probe = Database.setSavepoint();
      wdn_Reconciliation_Run__c guardProbe = new wdn_Reconciliation_Run__c(wdn_Mode__c='Preview');
      Database.insert(guardProbe, true, AccessLevel.USER_MODE);`,
    finish: 'Database.rollback(probe);',
  });
}

export function smokeWrites(ctx, file = 'smoke') {
  const name = `Evidence_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const publisher = ctx.user(PUBLISHER_KEY) ? PUBLISHER_KEY : INTEGRATION_KEY;
  const personaId = withPermissionSet(ctx, publisher, PUBLISHER, () => {
    const result = ctx.runAnonymous(
      `
      wdn_Persona__c persona = new wdn_Persona__c(Name='${name}', wdn_Api_Name__c='${name}', wdn_Active__c=true);
      Database.upsert(persona, wdn_Persona__c.Fields.wdn_Api_Name__c, true, AccessLevel.USER_MODE);
      Database.insert(new List<wdn_Persona_Component__c>{
        new wdn_Persona_Component__c(wdn_Persona__c=persona.Id, wdn_Type__c='Permission Set', wdn_Reference__c='EvidencePermissionSet'),
        new wdn_Persona_Component__c(wdn_Persona__c=persona.Id, wdn_Type__c='Public Group', wdn_Reference__c='EvidenceGroup')
      }, true, AccessLevel.USER_MODE);
      System.debug('PERSONA=' + persona.Id);
    `,
      { asUser: publisher },
    );
    ctx.check(`${file}: publisher upserted persona and inserted two components`, true);
    ctx.runAnonymous(
      `
      // The publisher has no Grant access, so the object may be invisible to
      // this user: a static reference would not compile. Resolve it at run time.
      Schema.SObjectType grantType = Schema.getGlobalDescribe().get('wdn_Provisioned_Grant__c');
      Boolean inserted = false;
      if (grantType != null) {
        System.assertEquals(false, grantType.getDescribe().isCreateable());
        try {
          SObject grant = grantType.newSObject();
          grant.put('wdn_User__c', ${soqlLiteral(identityId(ctx, publisher))});
          grant.put('wdn_Type__c', 'Permission Set');
          grant.put('wdn_Target_Id__c', ${soqlLiteral(targetIdFor(name))});
          inserted = Database.insert(grant, false, AccessLevel.USER_MODE).isSuccess();
        } catch (DmlException error) {
          System.assert(error.getDmlType(0) == StatusCode.INSUFFICIENT_ACCESS_OR_READONLY || error.getDmlType(0) == StatusCode.INVALID_FIELD_FOR_INSERT_UPDATE, error.getMessage());
        } catch (SObjectException error) {
          inserted = false;
        }
      }
      System.debug('GRANT_VISIBLE=' + (grantType != null));
      System.assertEquals(false, inserted);
    `,
      { asUser: publisher },
    );
    ctx.check(`${file}: publisher denied Grant create access`, true);
    return logId(result, 'PERSONA');
  });
  const userId = identityId(ctx, INTEGRATION_KEY);
  const assignment = ctx.runAnonymous(`
    wdn_Persona_Assignment__c assignment = new wdn_Persona_Assignment__c(
      wdn_Persona__c='${personaId}', wdn_User__c='${userId}', wdn_Status__c='Active');
    insert assignment;
    System.debug('ASSIGNMENT=' + assignment.Id);
  `);
  const assignmentId = logId(assignment, 'ASSIGNMENT');

  const ledger = withPermissionSet(ctx, INTEGRATION_KEY, INTEGRATION, () => {
    const rows = seedLedger(ctx, { name, assignmentId, personaId });
    ctx.runAnonymous(
      `
      Database.update(new wdn_Persona_Assignment__c(Id='${assignmentId}', wdn_Status__c='Revoked',
        wdn_Revoked_On__c=System.now(), wdn_Revoked_By_Run__c='${rows.runId}',
        wdn_Revoked_By__c=${soqlLiteral(identityId(ctx, INTEGRATION_KEY))}), true, AccessLevel.USER_MODE);
    `,
      { asUser: INTEGRATION_KEY },
    );
    ctx.check(`${file}: integration inserted Run, Item and Grant and revoked the assignment`, true);
    guardedRunDelete(ctx, `${file}: integration Run delete blocked by ledger guard`);
    return rows;
  });
  const records = { name, personaId, assignmentId, ...ledger };
  ctx.artifact(`scenario/${file}.json`, records);
  return records;
}
