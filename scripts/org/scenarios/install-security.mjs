import { soqlLiteral } from '../lib/apex.mjs';
import { checkVersion, readContract } from '../lib/install.mjs';
import { MAINTENANCE } from '../lib/permsets.mjs';

const expectedGrants = {
  AdminsOnly: () => ['System Administrator'],
  AllUsers: (profiles) => profiles,
};

export default {
  name: 'install-security',
  fresh: true,
  identities: [],
  setup: (ctx) => checkVersion(ctx),
  run(ctx) {
    const profiles = ctx.soql('SELECT Name FROM Profile ORDER BY Name').map((row) => row.Name);
    const grants = ctx
      .soql(
        `SELECT Parent.Profile.Name, Parent.Name, Parent.IsOwnedByProfile FROM SetupEntityAccess WHERE SetupEntityId IN (SELECT Id FROM CustomPermission WHERE DeveloperName = ${soqlLiteral(MAINTENANCE)})`,
      )
      .map(({ Parent }) => ({
        profile: Parent.Profile?.Name ?? null,
        permissionSet: Parent.IsOwnedByProfile ? null : Parent.Name,
        ownedByProfile: Parent.IsOwnedByProfile,
      }));
    grants.sort((left, right) =>
      (left.profile ?? left.permissionSet).localeCompare(right.profile ?? right.permissionSet),
    );

    const objects = Object.keys(readContract(ctx.root).objects).map(soqlLiteral).join(', ');
    const access = ctx
      .soql(
        `SELECT Parent.Profile.Name, SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE Parent.IsOwnedByProfile = true AND SobjectType IN (${objects})`,
      )
      .map(
        ({
          Parent,
          SobjectType,
          PermissionsRead,
          PermissionsCreate,
          PermissionsEdit,
          PermissionsDelete,
          PermissionsViewAllRecords,
          PermissionsModifyAllRecords,
        }) => ({
          profile: Parent.Profile.Name,
          object: SobjectType,
          read: PermissionsRead,
          create: PermissionsCreate,
          edit: PermissionsEdit,
          delete: PermissionsDelete,
          viewAll: PermissionsViewAllRecords,
          modifyAll: PermissionsModifyAllRecords,
        }),
      );
    access.sort((left, right) => left.profile.localeCompare(right.profile) || left.object.localeCompare(right.object));
    ctx.artifact('scenario/custom-permission-grants.json', grants);
    ctx.artifact('scenario/object-permissions.json', access);
    ctx.state.profiles = profiles;
    ctx.state.profileGrants = grants.filter((grant) => grant.ownedByProfile).map((grant) => grant.profile);
    ctx.metric('profiles', profiles.length);
    ctx.metric('profilesWithLedgerMaintenance', ctx.state.profileGrants.length);
  },
  verify(ctx) {
    const { profiles, profileGrants } = ctx.state;
    const expected = expectedGrants[ctx.securityType](profiles);
    const missing = expected.filter((profile) => !profileGrants.includes(profile));
    const unexpected = profileGrants.filter((profile) => !expected.includes(profile));
    const detail = { missing, unexpected };
    ctx.check('Scratch org profile inventory is available', profiles.includes('System Administrator'));
    ctx.check(
      `${ctx.securityType} Ledger Maintenance profile grants match`,
      !missing.length && !unexpected.length,
      JSON.stringify(detail),
    );
  },
};
