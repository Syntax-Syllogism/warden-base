import { soqlLiteral } from '../lib/apex.mjs';
import { guardedDml, INTEGRATION_KEY, smokeWrites, testIdentities } from '../lib/fixtures.mjs';
import { checkVersion, contractCheck, installPackage, readContract } from '../lib/install.mjs';
import { INTEGRATION, withPermissionSet } from '../lib/permsets.mjs';
import { SfError } from '../lib/sf.mjs';

function install(ctx, packageId, step) {
  const file = `scenario/${step}.json`;
  try {
    ctx.artifact(file, installPackage(ctx.sfJson, packageId, ctx.securityType));
    return true;
  } catch (error) {
    if (!(error instanceof SfError)) throw error;
    const detail = error.payload?.result ?? error.payload?.data;
    const failure = [error.name, error.message, JSON.stringify(detail ?? {})].join('\n');
    const betaRefusal =
      /cannotupgradebetapackage|(?:cannot|can't|can not|unable to|not allowed to) upgrade[^.]*?(?:beta|unpromoted)|(?:beta|unpromoted)[^.]*?(?:cannot|can't|can not|not supported|not allowed)[^.]*?upgrad|must [^.]*?uninstall[^.]*?beta/i;
    if (!betaRefusal.test(failure)) throw error;
    ctx.artifact(file, { packageId, outcome: 'blocked', message: error.message, detail });
    ctx.block('Upgrade blocked: no promoted predecessor', error.message);
    return false;
  }
}

function snapshot(ctx) {
  return Object.fromEntries(
    Object.keys(readContract(ctx.root).objects).map((object) => [
      object,
      ctx.soql(`SELECT Id FROM ${object} ORDER BY Id`).map((row) => row.Id),
    ]),
  );
}

export default {
  name: 'install-upgrade',
  fresh: true,
  identities: (ctx) => testIdentities(ctx, true),
  deploy(ctx) {
    ctx.metric('upgradeFrom', ctx.upgradeFrom);
    return install(ctx, ctx.upgradeFrom, 'install-predecessor');
  },
  setup(ctx) {
    return checkVersion(ctx, ctx.upgradeFrom, 'installed-before');
  },
  run(ctx) {
    const before = smokeWrites(ctx, 'smoke-before');
    ctx.state.seeded = snapshot(ctx);
    ctx.artifact('scenario/data-before.json', ctx.state.seeded);
    if (!install(ctx, ctx.packageId, 'upgrade')) return false;
    ctx.state.preUpgradeGrantId = before.grantId;
    return true;
  },
  verify(ctx) {
    if (!checkVersion(ctx, ctx.packageId, 'installed-after')) return;
    const kept = snapshot(ctx);
    ctx.artifact('scenario/data-after.json', kept);
    for (const [object, ids] of Object.entries(ctx.state.seeded)) {
      const missing = ids.filter((id) => !kept[object].includes(id));
      ctx.check(
        `${object} records survived the upgrade`,
        ids.length > 0 && missing.length === 0,
        `${ids.length} before, ${missing.length} missing`,
      );
    }
    contractCheck(ctx);
    withPermissionSet(ctx, INTEGRATION_KEY, INTEGRATION, () =>
      guardedDml(ctx, {
        label: 'Upgraded guard blocks edits to the existing Grant',
        operation: 'update',
        record: `new wdn_Provisioned_Grant__c(Id=${soqlLiteral(ctx.state.preUpgradeGrantId)}, wdn_Target_Label__c='Unexpected edit')`,
        mode: 'USER_MODE',
      }),
    );
    smokeWrites(ctx, 'smoke-after');
  },
};
