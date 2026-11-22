#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { runSf } from './sf.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const alias = 'warden-base-scratch-' + Date.now();
function sf(args) {
  runSf(args, { cwd: root, stdio: 'inherit' });
}

let created = false;
try {
  sf([
    'org',
    'create',
    'scratch',
    '--target-dev-hub',
    process.env.DEVHUB_ALIAS ?? 'devHub',
    '--definition-file',
    'config/project-scratch-def.json',
    '--alias',
    alias,
    '--duration-days',
    '1',
    '--wait',
    '20',
  ]);
  created = true;
  sf(['project', 'deploy', 'start', '--source-dir', 'sfdx-source/base', '--target-org', alias, '--wait', '20']);
  sf(['apex', 'run', 'test', '--target-org', alias, '--test-level', 'RunLocalTests', '--wait', '20']);
} catch (error) {
  console.error(error.message);
  process.exitCode = error.status || 1;
} finally {
  if (created) {
    try {
      sf(['org', 'delete', 'scratch', '--target-org', alias, '--no-prompt']);
    } catch (error) {
      console.error(`Scratch-org cleanup failed for ${alias}. ${error.message}`);
      process.exitCode ||= error.status || 1;
    }
  }
}
