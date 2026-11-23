import { checkVersion, contractCheck } from '../lib/install.mjs';
import { smokeWrites, testIdentities } from '../lib/fixtures.mjs';
import { BASE_PERMISSION_SETS, MAINTENANCE } from '../lib/permsets.mjs';
import { soqlLiteral } from '../lib/apex.mjs';

export default {
  name: 'install-smoke',
  identities: (ctx) => testIdentities(ctx, true),
  setup(ctx) {
    if (!checkVersion(ctx)) return false;
    const names = BASE_PERMISSION_SETS.map(soqlLiteral).join(', ');
    const permissionSets = ctx.soql(
      `SELECT Name FROM PermissionSet WHERE IsOwnedByProfile = false AND Name IN (${names})`,
    );
    const missing = BASE_PERMISSION_SETS.filter((name) => !permissionSets.some((row) => row.Name === name));
    ctx.check('All four packaged permission sets exist', missing.length === 0, missing.join(', '));
    const custom = ctx.soql(
      `SELECT DeveloperName FROM CustomPermission WHERE DeveloperName = ${soqlLiteral(MAINTENANCE)}`,
    );
    ctx.check('Ledger Maintenance custom permission exists', custom.length === 1);
    return missing.length === 0 && custom.length === 1;
  },
  run(ctx) {
    smokeWrites(ctx);
  },
  verify: contractCheck,
};
