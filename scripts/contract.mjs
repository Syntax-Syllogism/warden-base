#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseStringPromise } from 'xml2js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const metadataRoot = join(root, 'sfdx-source/base/main');
export const objectRoot = join(metadataRoot, 'schema/customObjects/objects');
export const permissionRoot = join(metadataRoot, 'user/permissionsets');

export async function readMetadata(path, rootElement) {
  const document = await parseStringPromise(readFileSync(path, 'utf8'), { trim: true });
  if (!document[rootElement]) throw new Error(`Expected <${rootElement}> in ${path}`);
  return document[rootElement];
}

export async function generateContract() {
  const project = JSON.parse(readFileSync(join(root, 'sfdx-project.json'), 'utf8'));
  const { package: packageName, versionNumber } = project.packageDirectories.find((dir) => dir.default);
  const objectNames = readdirSync(objectRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const objects = Object.fromEntries(objectNames.map((name) => [name, { fields: {}, childRelationships: {} }]));

  for (const name of objectNames) {
    const directory = join(objectRoot, name);
    const object = await readMetadata(join(directory, name + '.object-meta.xml'), 'CustomObject');
    const fieldDirectory = join(directory, 'fields');
    const fields = objects[name].fields;
    if (object.nameField) fields.Name = { type: object.nameField[0].type[0] };

    for (const file of readdirSync(fieldDirectory).sort()) {
      if (!file.endsWith('.field-meta.xml')) continue;
      const metadata = await readMetadata(join(fieldDirectory, file), 'CustomField');
      const [field] = metadata.fullName;
      const [type] = metadata.type;
      const referenceTo = metadata.referenceTo?.[0];
      const relationshipName = metadata.relationshipName?.[0];
      const values = metadata.valueSet?.[0].valueSetDefinition?.[0].value;
      fields[field] = { type };
      if (metadata.required?.[0] === 'true' || type === 'MasterDetail') fields[field].required = true;
      if (referenceTo) fields[field].referenceTo = referenceTo;
      if (relationshipName) fields[field].relationshipName = relationshipName;
      if (values) fields[field].values = values.map((value) => value.fullName[0]);

      if (relationshipName && Object.hasOwn(objects, referenceTo)) {
        const relationships = objects[referenceTo].childRelationships;
        const childName = relationshipName + '__r';
        if (Object.hasOwn(relationships, childName)) {
          throw new Error(`Duplicate child relationship ${referenceTo}.${childName}`);
        }
        relationships[childName] = name;
      }
    }
  }

  const permissionSets = {};
  for (const file of readdirSync(permissionRoot).sort()) {
    if (!file.endsWith('.permissionset-meta.xml')) continue;
    const metadata = await readMetadata(join(permissionRoot, file), 'PermissionSet');
    const access = {};
    for (const permission of metadata.objectPermissions ?? []) {
      access[permission.object[0]] = [...'CRED']
        .filter(
          (letter, index) =>
            permission[['allowCreate', 'allowRead', 'allowEdit', 'allowDelete'][index]]?.[0] === 'true',
        )
        .join('');
    }
    permissionSets[file.replace('.permissionset-meta.xml', '')] = access;
  }

  return { package: packageName, version: versionNumber.split('.').slice(0, 3).join('.'), objects, permissionSets };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = join(root, 'contract.json');
  const generated = JSON.stringify(await generateContract(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== generated) {
      console.error('contract.json is out of date. Run npm run contract:generate and commit the result.');
      process.exitCode = 1;
    }
  } else {
    writeFileSync(path, generated);
  }
}
