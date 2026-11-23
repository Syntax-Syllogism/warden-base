import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SfError } from './sf.mjs';

export function assertDisposableOrg({ org, orgInfo, env }, scenario) {
  const targets = [org, orgInfo.alias, orgInfo.username];
  if (['warden-gate', env.WARDEN_GATE_ORG].some((gate) => gate && targets.includes(gate))) {
    throw new Error(`${scenario} must not use the gate org`);
  }
  if (!orgInfo.scratch) throw new Error(`${scenario} requires a disposable scratch org`);
}

export function installPackage(sfJson, packageId, securityType) {
  const started = Date.now();
  const { result } = sfJson([
    'package',
    'install',
    '--package',
    packageId,
    '--wait',
    '30',
    '--publish-wait',
    '10',
    '--security-type',
    securityType,
    '--upgrade-type',
    'Mixed',
    '--no-prompt',
  ]);
  if (result?.Status?.toUpperCase() !== 'SUCCESS') {
    throw new SfError({ message: `Package install did not complete: ${result?.Status ?? 'unknown'}`, result });
  }
  return { packageId, status: result.Status, elapsedMs: Date.now() - started };
}

export function installedVersion(ctx) {
  const { result } = ctx.sfJson(['package', 'installed', 'list']);
  const row = result.find((entry) => entry.SubscriberPackageName === 'warden-base');
  return row ? { packageId: row.SubscriberPackageVersionId, version: row.SubscriberPackageVersionNumber } : null;
}

export function samePackage(left, right) {
  return Boolean(left && right && left.slice(0, 15) === right.slice(0, 15));
}

export function checkVersion(ctx, packageId = ctx.packageId, file = 'installed') {
  const version = installedVersion(ctx);
  ctx.artifact(`scenario/${file}.json`, version);
  const matches = samePackage(version?.packageId, packageId);
  ctx.check(
    `Installed warden-base version is ${packageId}`,
    matches,
    version ? `${version.version} (${version.packageId})` : 'Package missing',
  );
  return matches;
}

export function readContract(root) {
  return JSON.parse(readFileSync(join(root, 'contract.json'), 'utf8'));
}

function fieldType(field) {
  if (field.autoNumber) return 'AutoNumber';
  const types = {
    boolean: 'Checkbox',
    datetime: 'DateTime',
    double: 'Number',
    int: 'Number',
    picklist: 'Picklist',
    string: 'Text',
    textarea: 'LongTextArea',
  };
  return types[field.type] ?? field.type;
}

export function contractCheck(ctx) {
  const { objects } = readContract(ctx.root);
  const describes = Object.fromEntries(
    Object.keys(objects).map((name) => {
      try {
        return [name, ctx.sfJson(['sobject', 'describe', '--sobject', name]).result];
      } catch (error) {
        if (error instanceof SfError && /^(?:INVALID_TYPE|NOT_FOUND|NotFound)$/i.test(error.name)) return [name, null];
        throw error;
      }
    }),
  );
  const diff = [];
  const compare = (path, expected, actual) => {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) diff.push({ path, expected, actual: actual ?? null });
  };

  for (const [name, object] of Object.entries(objects)) {
    const describe = describes[name];
    if (!describe) {
      compare(name, 'Object exists', null);
      continue;
    }
    const fields = new Map(describe.fields.map((field) => [field.name, field]));
    for (const [nameOfField, expected] of Object.entries(object.fields)) {
      const path = `${name}.${nameOfField}`;
      const field = fields.get(nameOfField);
      if (!field) {
        compare(path, expected, null);
        continue;
      }
      let type = fieldType(field);
      if (field.type === 'reference') {
        const parent = describes[expected.referenceTo];
        const inverse = parent?.childRelationships.find(
          (child) => child.childSObject === name && child.field === nameOfField,
        );
        type = inverse?.cascadeDelete ? 'MasterDetail' : 'Lookup';
      }
      compare(`${path}.type`, expected.type, type);
      if (expected.referenceTo) compare(`${path}.referenceTo`, [expected.referenceTo], field.referenceTo);
      if (expected.values) {
        const values = field.picklistValues?.filter((value) => value.active).map((value) => value.value);
        compare(`${path}.values`, [...expected.values].sort(), values?.sort());
      }
    }
    for (const [relationship, expectedChild] of Object.entries(object.childRelationships)) {
      const child = describe.childRelationships.find((entry) => entry.relationshipName === relationship);
      compare(`${name}.childRelationships.${relationship}`, expectedChild, child?.childSObject);
    }
  }
  ctx.artifact('scenario/contract-diff.json', diff);
  ctx.check('Subscriber schema matches contract.json', diff.length === 0, `${diff.length} differences`);
  return diff.length === 0;
}
