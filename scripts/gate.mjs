#!/usr/bin/env node
// No-org gate. npm test includes the object model and generated contract checks.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function run(cmd) {
  process.stdout.write(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
}

if (!existsSync('node_modules')) run('npm ci --no-audit --no-fund');
run('npm test');
run('npm run format:apex:check');
run('npm run analyze -- --if-installed');
if (!process.argv.includes('--skip-apex')) run('npm run test:apex');
