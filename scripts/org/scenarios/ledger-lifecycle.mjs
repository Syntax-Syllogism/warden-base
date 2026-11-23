import { soqlLiteral } from '../lib/apex.mjs';
import {
  guardedDml,
  guardedRunDelete,
  holdsMaintenance,
  INTEGRATION_KEY,
  seedLedger,
  testIdentities,
} from '../lib/fixtures.mjs';
import { checkVersion, installedVersion, samePackage } from '../lib/install.mjs';
import { INTEGRATION, MAINTENANCE, withPermissionSet } from '../lib/permsets.mjs';
import { SfError } from '../lib/sf.mjs';

function exerciseGuard(ctx, { grantId, runId, itemId }) {
  const item = `new wdn_Reconciliation_Item__c(Id='${itemId}')`;
  const grant = `new wdn_Provisioned_Grant__c(Id='${grantId}')`;
  const grantUpdate = (fields) => `new wdn_Provisioned_Grant__c(Id='${grantId}', ${fields})`;
  const blocked = (label, operation, record) =>
    guardedDml(ctx, { label, operation, record, mode: operation === 'update' ? 'USER_MODE' : undefined });
  blocked('Ordinary Grant edit blocked', 'update', grantUpdate("wdn_Target_Label__c='Unexpected edit'"));
  blocked('Grant delete blocked', 'delete', grant);
  guardedRunDelete(ctx, 'Run delete blocked');
  blocked('Item delete blocked', 'delete', item);

  ctx.runAnonymous(
    `
    Database.update(${grantUpdate(`wdn_Revoked_On__c=System.now(), wdn_Revoked_By_Run__c='${runId}'`)}, true, AccessLevel.USER_MODE);
    Database.update(new wdn_Reconciliation_Run__c(Id='${runId}', wdn_Applied_Count__c=1), true, AccessLevel.USER_MODE);
    Database.update(new wdn_Reconciliation_Item__c(Id='${itemId}', wdn_Status__c='Applied'), true, AccessLevel.USER_MODE);
  `,
    { asUser: INTEGRATION_KEY },
  );
  ctx.check('First two-field revocation stamp accepted', true);
  ctx.check('Run and Item field updates accepted', true);
  blocked(
    'Second revocation stamp blocked',
    'update',
    grantUpdate(`wdn_Revoked_On__c=System.now().addDays(1), wdn_Revoked_By_Run__c='${runId}'`),
  );
  blocked(
    'Clearing the revocation stamp blocked',
    'update',
    grantUpdate('wdn_Revoked_On__c=null, wdn_Revoked_By_Run__c=null'),
  );
}

export function maintenancePurge(ctx, { grantId, runId }) {
  withPermissionSet(ctx, INTEGRATION_KEY, MAINTENANCE, () => {
    if (!holdsMaintenance(ctx, INTEGRATION_KEY)) throw new Error(`${INTEGRATION_KEY} does not hold ${MAINTENANCE}`);
    return ctx.runAnonymous(
      `
    Database.delete(new wdn_Provisioned_Grant__c(Id='${grantId}'), true, AccessLevel.USER_MODE);
    Database.delete(new wdn_Reconciliation_Run__c(Id='${runId}'), true, AccessLevel.USER_MODE);
  `,
      { asUser: INTEGRATION_KEY },
    );
  });
}

function exists(ctx, object, id) {
  return ctx.soql(`SELECT Id FROM ${object} WHERE Id = ${soqlLiteral(id)}`).length > 0;
}

function observeUninstall(ctx, records) {
  const name = 'scenario/uninstall.json';
  const before =
    exists(ctx, 'wdn_Reconciliation_Run__c', records.runId) &&
    exists(ctx, 'wdn_Reconciliation_Item__c', records.itemId);
  ctx.check('Run and Item remain before uninstall', before);
  let result;
  try {
    ({ result } = ctx.sfJson(['package', 'uninstall', '--package', ctx.packageId, '--wait', '30']));
  } catch (error) {
    if (!(error instanceof SfError)) throw error;
    const detail = error.payload?.result ?? error.detail;
    const refusal = /uninstall.+(?:failed|refus|blocked)|(?:cannot|unable to) uninstall|dependen|referenc/i.test(
      error.message,
    );
    const retained = samePackage(installedVersion(ctx)?.packageId, ctx.packageId);
    ctx.artifact(name, { outcome: refusal && retained ? 'refused' : 'error', message: error.message, detail, records });
    ctx.check('Salesforce refused uninstall and retained the package', refusal && retained, error.message);
    return;
  }
  const installed = installedVersion(ctx);
  if (result?.Status?.toUpperCase() !== 'SUCCESS') {
    const refused = /^(?:error|failed)$/i.test(result?.Status) && samePackage(installed?.packageId, ctx.packageId);
    ctx.artifact(name, { outcome: refused ? 'refused' : 'incomplete', result, records });
    ctx.check('Salesforce returned an uninstall outcome', refused, result?.Status ?? 'Unknown');
    return;
  }
  const objects = ctx.soql(
    "SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = 'wdn_Reconciliation_Run__c'",
  );
  const removed = installed === null && objects.length === 0;
  ctx.artifact(name, { outcome: removed ? 'uninstalled' : 'incomplete', result, records, installed, objects });
  ctx.check('Uninstall removed the package and its populated Run object', removed);
}

export default {
  name: 'ledger-lifecycle',
  fresh: true,
  identities: testIdentities,
  setup(ctx) {
    if (ctx.securityType !== 'AdminsOnly') {
      throw new Error('ledger-lifecycle requires --security-type AdminsOnly');
    }
    return checkVersion(ctx);
  },
  run(ctx) {
    const primary = withPermissionSet(ctx, INTEGRATION_KEY, INTEGRATION, () => {
      const rows = seedLedger(ctx, { name: 'ledger-guard' });
      exerciseGuard(ctx, rows);
      return rows;
    });
    ctx.artifact('scenario/ledger.json', primary);
    maintenancePurge(ctx, primary);
    ctx.check(
      'Non-admin Ledger Maintenance user purged Grant and Run',
      !exists(ctx, 'wdn_Provisioned_Grant__c', primary.grantId) &&
        !exists(ctx, 'wdn_Reconciliation_Run__c', primary.runId),
    );
    ctx.check(
      'Run purge cascaded to its master-detail Item',
      !exists(ctx, 'wdn_Reconciliation_Item__c', primary.itemId),
    );
    ctx.state.remaining = withPermissionSet(ctx, INTEGRATION_KEY, INTEGRATION, () =>
      seedLedger(ctx, { name: 'ledger-uninstall' }),
    );
  },
  verify(ctx) {
    const { remaining } = ctx.state;
    ctx.runAnonymous(`
      System.assert(FeatureManagement.checkPermission('${MAINTENANCE}'));
      Database.delete(new wdn_Provisioned_Grant__c(Id='${remaining.grantId}'), true, AccessLevel.USER_MODE);
    `);
    ctx.check(
      `${ctx.securityType} System Administrator bypasses the ledger guard`,
      !exists(ctx, 'wdn_Provisioned_Grant__c', remaining.grantId),
    );
    observeUninstall(ctx, remaining);
  },
};
