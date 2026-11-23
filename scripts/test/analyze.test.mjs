import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../analyze.mjs', import.meta.url));
const fixture = `const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const mode = process.env.WDB_ANALYZER_TEST_MODE;
const jsonFlagCount = process.argv.slice(2).filter((arg) => arg === '--json').length;
if (process.argv[2] === 'plugins') {
  assert.equal(jsonFlagCount, 1, 'plugin discovery requires exactly one --json flag');
  if (mode === 'invalid-json') {
    console.log('not JSON');
    process.exit(0);
  }
  const type = mode === 'missing' ? 'jit' : 'user';
  console.log(JSON.stringify({ result: [{ name: '@salesforce/plugin-code-analyzer', type }] }));
} else {
  assert.equal(jsonFlagCount, 0, 'code-analyzer run rejects --json');
  console.log('analyzer output');
  if (mode === 'violation') process.exit(5);
  const log = mode === 'engine-error'
    ? "[2026-11-22T00:00:00.000Z] Error cpd - CPD issued a processing error"
    : "[2026-11-22T00:00:00.000Z] Info cpd - Scan completed";
  writeFileSync(join(process.env.TEMP, 'sfca-2026_11_22.log'), log);
}
`;

test('analyzer gate skips only an absent plugin and fails on findings or engine errors', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'wdb-analyzer-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  if (process.platform === 'win32') {
    const bin = join(directory, 'node_modules', '@salesforce', 'cli', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'run.js'), fixture);
    writeFileSync(join(directory, 'sf.cmd'), '@exit /b 99\r\n');
  } else {
    writeFileSync(join(directory, 'sf'), '#!/usr/bin/env node\n' + fixture, { mode: 0o755 });
  }

  function run(mode) {
    return spawnSync(process.execPath, [script, '--if-installed'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: directory + delimiter + process.env.PATH,
        TEMP: directory,
        TMP: directory,
        TMPDIR: directory,
        WDB_ANALYZER_TEST_MODE: mode,
      },
    });
  }

  const missing = run('missing');
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.stdout, /Skipping Salesforce Code Analyzer/);
  assert.doesNotMatch(missing.stdout, /analyzer output/);

  const clean = run('clean');
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /analyzer output/);

  const violation = run('violation');
  assert.equal(violation.status, 5, violation.stderr);
  assert.match(violation.stdout, /analyzer output/);

  const engineError = run('engine-error');
  assert.equal(engineError.status, 1);
  assert.match(engineError.stderr, /reported an engine error:[\s\S]*CPD issued a processing error/);

  const invalidJson = run('invalid-json');
  assert.equal(invalidJson.status, 1);
  assert.match(invalidJson.stderr, /sf plugins did not return a valid JSON plugin list/);
  assert(!readdirSync(directory).some((name) => name.startsWith('wdb-analyzer-')));
});
