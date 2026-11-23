import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenarios, parseArgs, runHarness } from '../harness.mjs';
import { createSfJson, SfError, sfFailureDetail, sfLauncher } from '../lib/sf.mjs';
import { createRedactor, renderSummary, trimLog, writeArtifact } from '../lib/evidence.mjs';
import { createIdentities, usernameFor } from '../lib/identities.mjs';
import { createApex } from '../lib/apex.mjs';
const orgId = '00D000000000001AAA';
const packageId = '04tfj000000mt2DAAQ';
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'warden-evidence-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('Salesforce JSON wrapper captures output and typed errors without inheriting stdio', () => {
  const results = [];
  const sf = createSfJson({
    execute: (bin, args, options) => {
      assert.equal(bin, 'sf');
      assert.equal(args.at(-1), '--json');
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
      return '{"status":0,"result":{"ok":true}}';
    },
    onResult: (result) => results.push(result),
  });
  assert.equal(sf(['org', 'display']).result.ok, true);
  assert.equal(results.length, 1);
  for (const throws of [false, true]) {
    const failed = createSfJson({
      execute: () => {
        const stdout = '{"status":7,"name":"DeployError","message":"bad deploy"}';
        if (throws) throw Object.assign(new Error(), { stdout, status: 7 });
        return stdout;
      },
    });
    assert.throws(
      () => failed([]),
      (error) =>
        error instanceof SfError &&
        error.status === 7 &&
        error.name === 'DeployError' &&
        error.message === 'bad deploy',
    );
  }
  assert.throws(() => createSfJson({ execute: () => 'not json' })([]), {
    name: 'SfInvalidResponse',
  });
});

test('Salesforce CLI failures without a message keep Apex and CLI detail', () => {
  const apexFailure = createSfJson({
    execute: () => {
      throw Object.assign(new Error('exit 1'), {
        status: 1,
        stderr: 'plugin warning',
        stdout: JSON.stringify({
          status: 1,
          result: {
            success: false,
            compiled: true,
            exceptionMessage: 'System.QueryException: List has no rows',
            exceptionStackTrace: 'AnonymousBlock: line 3, column 1',
          },
        }),
      });
    },
  });
  assert.throws(
    () => apexFailure(['apex', 'run', '--target-org', 'x']),
    (error) =>
      error instanceof SfError &&
      error.message === 'System.QueryException: List has no rows' &&
      error.detail.exceptionStackTrace === 'AnonymousBlock: line 3, column 1' &&
      error.detail.stderr === 'plugin warning' &&
      error.command.join(' ') === 'apex run --target-org',
  );
  const deployFailure = createSfJson({
    execute: () =>
      JSON.stringify({
        status: 1,
        result: { details: { componentFailures: [{ problem: 'Bad field' }] } },
      }),
  });
  assert.throws(
    () => deployFailure(['project', 'deploy', 'start']),
    (error) => /Bad field/.test(error.message) && /Bad field/.test(error.detail.failures),
  );
  assert.deepEqual(sfFailureDetail({ status: 1 }), {});
  assert.equal(sfFailureDetail({ result: { failures: ['x'.repeat(5000)] } }).failures.length, 4001);
});

test('evidence redacts sensitive fields, free-text usernames, tokens, and auth URLs', (t) => {
  const redact = createRedactor();
  redact({ accessToken: 'opaque-secret-value', password: 'password-secret' });
  const data = redact({
    username: 'private@example.test',
    nested: { sfdxAuthUrl: 'force://secret' },
    log: 'opaque-secret-value password-secret private@example.test https://host/secur/frontdoor.jsp?sid=123 force://secret Bearer abc 00D000000000001!token',
  });
  const json = JSON.stringify(data);
  for (const secret of [
    'private@example',
    'opaque-secret-value',
    'password-secret',
    'force://',
    'sid=123',
    'Bearer abc',
    '!token',
  ])
    assert.ok(!json.includes(secret), secret);
  assert.equal(
    redact({ instanceUrl: 'https://example.my.salesforce.com' }).instanceUrl,
    'https://example.my.salesforce.com',
  );
  const dir = temp(t);
  assert.throws(() => writeArtifact(dir, '../escape.json', {}, redact));
  writeArtifact(dir, 'large.json', { log: 'x'.repeat(300000) }, redact);
  assert.equal(JSON.parse(readFileSync(join(dir, 'large.json'))).truncated, true);
});

test('logs retain at most 200 lines and 256KB, including multibyte text', () => {
  assert.equal(trimLog(Array.from({ length: 300 }, (_, i) => String(i)).join('\n')).split('\n')[0], '100');
  assert.ok(Buffer.byteLength(trimLog('é'.repeat(300000))) <= 256 * 1024);
});

test('summary rendering preserves checks, metrics and dirty provenance', () => {
  const fixture = {
    scenario: 'sample',
    outcome: 'failed',
    startedAt: '2026-10-17T00:00:00Z',
    finishedAt: '2026-10-17T00:01:00Z',
    commit: 'abcdef',
    dirty: true,
    packageVersion: '04tfj000000mt2DAAQ',
    securityType: 'AdminsOnly',
    checks: [{ name: 'Coverage', outcome: 'failed', detail: '74%' }],
    metrics: { coveragePercent: 74 },
  };
  const markdown = renderSummary(fixture);
  for (const expected of [
    '**failed**',
    'abcdef (dirty)',
    '04tfj000000mt2DAAQ',
    'Security type: AdminsOnly',
    'failed: Coverage — 74%',
    '"coveragePercent": 74',
  ])
    assert.ok(markdown.includes(expected));
});

test('deterministic usernames and identities reuse users and assign permsets', (t) => {
  assert.equal(usernameFor('admin', orgId), 'admin.00d000000000001@warden-evidence.test');
  assert.throws(() => usernameFor('../admin', orgId));
  assert.throws(() => usernameFor('admin', 'bad'));
  temp(t);
  const users = new Map();
  let exists = false;
  let definition;
  let definitionFile;
  const calls = [];
  const ensure = createIdentities({
    org: 'test',
    orgId,
    users,
    soql: (query) =>
      query.includes('FROM Profile')
        ? [{ Id: 'profile' }]
        : query.includes('FROM PermissionSetAssignment')
          ? exists
            ? [{ PermissionSet: { Name: 'wdn_Base_Viewer' } }]
            : []
          : exists
            ? [{ ProfileId: 'profile', IsActive: true }]
            : [],
    sfJson: (args) => {
      calls.push(args);
      if (args.includes('--definition-file')) {
        definitionFile = args[args.indexOf('--definition-file') + 1];
        definition = JSON.parse(readFileSync(definitionFile));
      }
      return { status: 0 };
    },
  });
  const spec = {
    key: 'reader',
    license: 'Salesforce',
    profile: 'Standard User',
    permissionSets: ['wdn_Base_Viewer', 'wdn_Integration'],
  };
  assert.deepEqual(ensure(spec), {
    key: 'reader',
    license: 'Salesforce',
    profile: 'Standard User',
    permissionSets: ['wdn_Base_Viewer', 'wdn_Integration'],
  });
  assert.equal(definition.profileId, 'profile');
  const assignment = calls.find((args) => args.includes('permset'));
  assert.deepEqual(assignment.slice(5, 9), ['--name', 'wdn_Base_Viewer', '--name', 'wdn_Integration']);
  assert.equal(existsSync(definitionFile), false);
  exists = true;
  ensure(spec);
  assert.equal(calls.filter((args) => args.includes('create')).length, 1);
  // A reused user is only assigned the permission sets it does not hold yet.
  const reassigned = calls.filter((args) => args.includes('permset'));
  assert.equal(reassigned.length, 2);
  assert.deepEqual(reassigned[1].slice(5), [
    '--name',
    'wdn_Integration',
    '--on-behalf-of',
    usernameFor('reader', orgId),
  ]);
  assert.equal(users.get('reader'), usernameFor('reader', orgId));
});

test('anonymous Apex uses separate authenticated identities and removes temp files', () => {
  let path;
  const apex = createApex({
    org: 'admin',
    users: new Map([['reader', 'reader-user']]),
    sfJson: (args) => {
      assert.equal(args[args.indexOf('--target-org') + 1], 'reader-user');
      path = args.at(-1);
      assert.equal(readFileSync(path, 'utf8'), "System.debug('test');");
      return { result: { success: false, exceptionMessage: 'denied' } };
    },
  });
  assert.throws(() => apex.runAnonymous("System.debug('test');", { asUser: 'reader' }), /denied/);
  assert.equal(existsSync(path), false);
  assert.throws(() => apex.runAnonymous('', { asUser: 'unknown' }), /Unknown identity/);
});

test('sfLauncher runs the CLI entry script with Node on Windows only', () => {
  assert.deepEqual(sfLauncher(['org', 'list'], { platform: 'linux' }), ['sf', ['org', 'list']]);
  const [bin, args] = sfLauncher(['data', 'query', '-q', 'SELECT Id FROM User'], {
    platform: 'win32',
    nodePath: 'node.exe',
    locate: () => ['C:/npm/sf.cmd'],
    exists: () => true,
  });
  assert.equal(bin, 'node.exe');
  assert.equal(args[0], '--no-deprecation');
  assert.equal(args[1], join('C:/npm', 'node_modules', '@salesforce', 'cli', 'bin', 'run.js'));
  assert.deepEqual(args.slice(2), ['data', 'query', '-q', 'SELECT Id FROM User']);
  assert.throws(
    () =>
      sfLauncher([], {
        platform: 'win32',
        locate: () => [],
        exists: () => false,
      }),
    /entry script not found/,
  );
});

test('CLI validates package mode and the built-in scenarios implement the contract', async () => {
  const names = ['install-smoke', 'install-upgrade', 'ledger-lifecycle', 'install-security'];
  assert.deepEqual(
    (await loadScenarios(names)).map(({ name }) => name),
    names,
  );
  assert.throws(() => parseArgs(['--scenario', 'install-smoke']), /--package/);
  assert.throws(() => parseArgs(['--scenario', '../install-smoke', '--package', packageId]), /Invalid scenario/);
  assert.throws(() => parseArgs(['--scenario', 'install-smoke', '--package', 'bad']), /04t/);
  const args = ['--scenario', 'install-smoke,install-smoke', '--package', packageId];
  assert.deepEqual(parseArgs(args), {
    scenarios: ['install-smoke'],
    package: packageId,
    securityType: 'AdminsOnly',
    keep: false,
  });
  assert.throws(() => parseArgs([...args, '--security-type', 'Everyone']), /AdminsOnly or AllUsers/);
  assert.throws(() => parseArgs([...args, '--security-type']), /Missing value/);
  assert.equal(
    parseArgs([...args, '--security-type', 'AllUsers', '--org', 'reuse', '--keep']).securityType,
    'AllUsers',
  );
  assert.equal(parseArgs(['--help']).help, true);
});

function mockHarness(t, { failCommand, failPhase, selected, scratch = true } = {}) {
  const evidenceRoot = temp(t);
  const calls = [];
  const scenarios =
    selected ??
    ['sample', 'second'].map((name) => ({
      name,
      identities: [],
      setup() {
        if (failPhase === 'setup') throw new Error('setup failed');
      },
      run(ctx) {
        ctx.artifact('scenario/action.json', { note: 'never-save-this', user: 'private@example.test' });
        if (failPhase === 'run') throw new Error('run failed for private@example.test');
        ctx.check('sample check', true);
      },
      verify() {
        if (failPhase === 'verify') throw new Error('verify failed');
      },
      cleanup() {
        if (failPhase === 'cleanup') throw new Error('cleanup failed');
      },
    }));
  const run = (options = {}) =>
    runHarness(
      { package: packageId, ...options },
      {
        scenarios,
        evidenceRoot,
        execute(bin, args) {
          assert.equal(bin, 'sf');
          assert.equal(args.at(-1), '--json');
          const command = args.slice(0, 3).join(' ');
          calls.push(args);
          if (command === failCommand) return JSON.stringify({ status: 1, message: 'Failed for private@example.test' });
          let result = {};
          if (command.startsWith('org display')) {
            result = {
              devHubId: scratch ? 'hub' : null,
              username: 'admin@example.test',
              accessToken: 'never-save-this',
            };
          } else if (command.startsWith('data query')) {
            result = { records: [{ Id: orgId, OrganizationType: 'Developer' }] };
          } else if (command.startsWith('package install')) {
            result = { Status: 'SUCCESS' };
          }
          return JSON.stringify({ status: 0, result });
        },
        git: (args) => (args[0] === 'rev-parse' ? 'abcdef123456789' : ''),
        log() {},
        env: {},
      },
    );
  function evidence() {
    return readdirSync(evidenceRoot).map((name) => {
      const folder = join(evidenceRoot, name);
      for (const file of ['summary.json', 'summary.md', 'scenario/sf-calls.json', 'scenario/action.json']) {
        const path = join(folder, file);
        if (!existsSync(path)) continue;
        assert.doesNotMatch(readFileSync(path, 'utf8'), /never-save-this|admin@example.test|private@example.test/);
      }
      return { name, summary: JSON.parse(readFileSync(join(folder, 'summary.json'), 'utf8')) };
    });
  }
  return { run, evidence, calls };
}

test('harness installs once for multiple scenarios and suffixes repeated evidence folders', async (t) => {
  const { run, calls, evidence } = mockHarness(t);
  assert.equal(await run({ securityType: 'AllUsers' }), 0);
  assert.equal(calls.filter((args) => args[1] === 'install').length, 1);
  const install = calls.find((args) => args[1] === 'install');
  assert.equal(install[install.indexOf('--security-type') + 1], 'AllUsers');
  assert.equal(calls.filter((args) => args[1] === 'delete').length, 1);
  assert.ok(!calls.some((args) => args[0] === 'project'));
  assert.equal(await run({ securityType: 'AllUsers' }), 0);
  assert.equal(evidence().filter(({ name }) => name.endsWith('-abcdef1-2')).length, 2);
  assert.ok(evidence().every(({ summary }) => summary.outcome === 'passed' && summary.securityType === 'AllUsers'));
});

test('reused and kept orgs are never deleted, and non-scratch and gate targets cannot install', async (t) => {
  for (const options of [{ org: 'existing-scratch' }, { keep: true }]) {
    const { run, calls } = mockHarness(t);
    assert.equal(await run(options), 0);
    assert.ok(!calls.some((args) => args[1] === 'delete'));
    if (options.org) assert.ok(!calls.some((args) => args[1] === 'create'));
  }
  for (const [org, scratch] of [
    ['sandbox', false],
    ['warden-gate', true],
  ]) {
    const { run, calls } = mockHarness(t, { scratch });
    assert.equal(await run({ org }), 1);
    assert.ok(!calls.some((args) => ['install', 'delete'].includes(args[1])));
  }
});

test('initialization, setup, run, verify and cleanup failures keep redacted evidence and fail the run', async (t) => {
  for (const options of [
    { failCommand: 'org create scratch' },
    { failCommand: 'package install --package' },
    { failCommand: 'org delete scratch' },
    ...['setup', 'run', 'verify', 'cleanup'].map((failPhase) => ({ failPhase })),
  ]) {
    const { run, evidence, calls } = mockHarness(t, options);
    assert.equal(await run(), 1);
    assert.ok(evidence().every(({ summary }) => summary.outcome === 'error' && summary.finishedAt));
    assert.equal(
      calls.filter((args) => args[1] === 'delete').length,
      options.failCommand === 'org create scratch' ? 0 : 1,
    );
  }
});

test('a blocked custom deployment keeps evidence, skips execution and exits nonzero', async (t) => {
  const [upgrade] = await loadScenarios(['install-upgrade']);
  const setup = () => assert.fail('setup cannot run without the predecessor install');
  const { run, evidence, calls } = mockHarness(t, {
    selected: [
      {
        ...upgrade,
        setup,
        deploy(ctx) {
          ctx.block('Upgrade blocked: no promoted predecessor', 'Salesforce refused the beta');
          return false;
        },
      },
    ],
  });
  const upgradeFrom = '04tfj000000mpEjAAI';
  await assert.rejects(run({ upgradeFrom, org: 'existing-scratch' }), /new scratch org/);
  assert.equal(await run({ upgradeFrom }), 1);
  assert.equal(evidence()[0].summary.outcome, 'blocked');
  assert.ok(evidence()[0].summary.finishedAt);
  assert.equal(calls.filter((args) => args[1] === 'install').length, 0);
  assert.equal(calls.filter((args) => args[1] === 'delete').length, 1);
});
