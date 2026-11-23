#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSfJson } from './lib/sf.mjs';
import { createApex } from './lib/apex.mjs';
import { createIdentities } from './lib/identities.mjs';
import { assertDisposableOrg, installPackage, samePackage } from './lib/install.mjs';
import { createRedactor, renderSummary, writeArtifact } from './lib/evidence.mjs';

export const PACKAGE_VERSION_ID = /^04t[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/;

export function parseArgs(args) {
  const options = { scenarios: [], keep: false, securityType: 'AdminsOnly' };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--keep') options.keep = true;
    else if (arg === '--help') options.help = true;
    else if (['--scenario', '--org', '--package', '--upgrade-from', '--security-type'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--org') options.org = value;
      else if (arg === '--security-type') {
        if (!['AdminsOnly', 'AllUsers'].includes(value))
          throw new Error('--security-type expects AdminsOnly or AllUsers');
        options.securityType = value;
      } else if (arg === '--scenario') options.scenarios.push(...value.split(','));
      else {
        if (!PACKAGE_VERSION_ID.test(value)) throw new Error(`${arg} expects a package version ID (04t)`);
        options[arg === '--package' ? 'package' : 'upgradeFrom'] = value;
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.help && !options.scenarios.length) throw new Error('Specify --scenario <name>[,<name>]');
  if (!options.help && !options.package) throw new Error('Specify --package <04t>');
  if (!options.scenarios.every((name) => /^[a-z][a-z0-9-]*$/.test(name))) throw new Error('Invalid scenario name');
  options.scenarios = [...new Set(options.scenarios)];
  return options;
}

export async function loadScenarios(names) {
  return Promise.all(
    names.map(async (name) => {
      const scenario = (await import(new URL(`./scenarios/${name}.mjs`, import.meta.url))).default;
      if (
        scenario?.name !== name ||
        !(Array.isArray(scenario.identities) || typeof scenario.identities === 'function') ||
        !['setup', 'run', 'verify'].every((phase) => typeof scenario[phase] === 'function')
      ) {
        throw new Error(`Invalid scenario contract: ${name}`);
      }
      return scenario;
    }),
  );
}

export async function runHarness(
  options,
  {
    scenarios,
    execute,
    root = fileURLToPath(new URL('../../', import.meta.url)),
    evidenceRoot = join(root, 'docs/evidence'),
    git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(),
    log = console.log,
    env = process.env,
  } = {},
) {
  const commit = git(['rev-parse', 'HEAD']);
  const dirty = Boolean(git(['status', '--porcelain']));
  if (dirty) log('Warning: evidence is from a dirty working tree.');
  const selected = scenarios ?? (await loadScenarios(options.scenarios));
  const exclusive = selected.find((scenario) => scenario.fresh || scenario.deploy);
  if (exclusive && selected.length !== 1) throw new Error(`${exclusive.name} must run alone`);
  if (exclusive?.fresh && options.org)
    throw new Error(`${exclusive.name} requires a new scratch org created by the harness`);
  if (selected.some((scenario) => scenario.name === 'install-upgrade')) {
    if (!options.upgradeFrom || samePackage(options.upgradeFrom, options.package)) {
      throw new Error('install-upgrade requires a distinct --upgrade-from <04t>');
    }
  }
  const project = JSON.parse(readFileSync(join(root, 'sfdx-project.json'), 'utf8'));
  const org = options.org ?? `warden-evidence-${Date.now()}`;
  const redact = createRedactor();
  const calls = [];
  const onResult = (result) => {
    redact(result);
    calls.push(result);
  };
  const sf = createSfJson({ execute, onResult });
  const scopedSf = (args) => sf([...args, '--target-org', org]);
  const securityType = options.securityType ?? 'AdminsOnly';
  const summaries = [];
  const artifacts = [];
  const startedAt = new Date().toISOString();
  let created = false;
  let orgInfo = {
    edition: null,
    instanceUrl: null,
    apiVersion: project.sourceApiVersion,
    scratch: null,
  };
  let initError;
  try {
    try {
      if (!options.org) {
        sf([
          'org',
          'create',
          'scratch',
          '--definition-file',
          join(root, 'config/project-scratch-def.json'),
          '--alias',
          org,
          '--target-dev-hub',
          env.DEVHUB_ALIAS ?? 'devHub',
          '--duration-days',
          env.SCRATCH_DURATION ?? '1',
          '--wait',
          '20',
          '--no-namespace',
        ]);
        created = true;
      }
      const display = sf(['org', 'display', '--target-org', org]).result;
      const apex = createApex({ sfJson: sf, org });
      const organization = apex.soql('SELECT Id, OrganizationType FROM Organization')[0];
      orgInfo = {
        ...orgInfo,
        edition: organization.OrganizationType,
        instanceUrl: display.instanceUrl,
        scratch: created || Boolean(display.devHubId),
        id: organization.Id,
        alias: display.alias,
        username: display.username,
      };
      assertDisposableOrg({ org, orgInfo, env }, 'Org evidence');
      if (!exclusive?.deploy) installPackage(scopedSf, options.package, securityType);
    } catch (error) {
      initError = error;
    }

    for (const scenario of selected) {
      const summary = {
        scenario: scenario.name,
        startedAt,
        finishedAt: null,
        commit,
        dirty,
        packageVersion: options.package ?? null,
        securityType,
        org: {
          edition: orgInfo.edition,
          instanceUrl: orgInfo.instanceUrl,
          apiVersion: orgInfo.apiVersion,
          scratch: orgInfo.scratch,
        },
        identities: [],
        outcome: 'passed',
        checks: [],
        metrics: {},
      };
      const files = new Map();
      summaries.push(summary);
      artifacts.push(files);
      const users = new Map();
      const apex = createApex({ sfJson: sf, org, users });
      const ctx = {
        sfJson: scopedSf,
        env,
        org,
        root,
        orgInfo,
        packageId: options.package,
        upgradeFrom: options.upgradeFrom,
        securityType,
        user: (key) => users.get(key),
        state: {},
        ...apex,
        metrics: summary.metrics,
        artifact: (name, data) => {
          redact(data);
          files.set(name, data);
        },
        metric: (name, value) => {
          summary.metrics[name] = value;
        },
        block: (name, detail) => {
          summary.checks.push({ name, outcome: 'blocked', detail });
          if (summary.outcome === 'passed') summary.outcome = 'blocked';
        },
        check: (name, passed, detail = '') => {
          summary.checks.push({
            name,
            outcome: passed ? 'passed' : 'failed',
            detail,
          });
          if (!passed) summary.outcome = 'failed';
        },
      };
      let phase = 'initialization';
      let initialized = false;
      try {
        if (initError) throw initError;
        initialized = true;
        phase = 'deployment';
        const deployed = await scenario.deploy?.(ctx);
        if (deployed === false) continue;
        phase = 'identities';
        const ensureUser = createIdentities({
          sfJson: sf,
          soql: apex.soql,
          org,
          orgId: orgInfo.id,
          users,
        });
        const specs = typeof scenario.identities === 'function' ? scenario.identities(ctx) : scenario.identities;
        for (const spec of specs ?? []) summary.identities.push(ensureUser(spec));
        for (phase of ['setup', 'run', 'verify']) {
          if ((await scenario[phase](ctx)) === false) break;
        }
      } catch (error) {
        summary.outcome = 'error';
        summary.checks.push({
          name: phase,
          outcome: 'failed',
          detail: error.message,
        });
        files.set('scenario/error.json', {
          name: error.name,
          status: error.status,
          message: error.message,
          ...(error.command?.length ? { command: error.command } : {}),
          ...(error.detail && Object.keys(error.detail).length ? { detail: error.detail } : {}),
        });
      } finally {
        if (initialized && scenario.cleanup) {
          try {
            await scenario.cleanup(ctx);
          } catch (error) {
            summary.outcome = 'error';
            summary.checks.push({ name: 'cleanup', outcome: 'failed', detail: error.message });
          }
        }
        summary.finishedAt = new Date().toISOString();
      }
    }
  } finally {
    if (created && !options.keep) {
      try {
        sf(['org', 'delete', 'scratch', '--target-org', org, '--no-prompt']);
      } catch (error) {
        for (const summary of summaries) {
          summary.outcome = 'error';
          summary.checks.push({
            name: 'Scratch org cleanup',
            outcome: 'failed',
            detail: error.message,
          });
        }
        log(`Scratch org cleanup failed; alias: ${org}`);
      }
    }
  }
  if (created && options.keep) log(`Kept scratch org alias: ${org}`);
  mkdirSync(evidenceRoot, { recursive: true });
  const date = startedAt.slice(0, 10);
  for (const [index, summary] of summaries.entries()) {
    const base = join(evidenceRoot, `${date}-${summary.scenario}-${commit.slice(0, 7)}`);
    let folder = base;
    for (let suffix = 2; ; suffix++) {
      try {
        mkdirSync(folder, { recursive: false });
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        folder = `${base}-${suffix}`;
      }
    }
    for (const [name, data] of artifacts[index]) writeArtifact(folder, name, data, redact);
    writeArtifact(folder, 'scenario/sf-calls.json', calls, redact);
    // Summaries stay complete, machine-readable JSON, independent of log limits.
    const safeSummary = redact(summary);
    writeFileSync(join(folder, 'summary.json'), JSON.stringify(safeSummary, null, 2) + '\n');
    writeFileSync(join(folder, 'summary.md'), renderSummary(safeSummary));
    log(`${summary.scenario}: ${summary.outcome} — ${folder}`);
  }
  return summaries.every((summary) => summary.outcome === 'passed') ? 0 : 1;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log(
        'Usage: npm run org:evidence -- --scenario <name>[,<name>] --package <04t> [--security-type AdminsOnly|AllUsers] [--org <alias>] [--keep] [--upgrade-from <04t>]',
      );
      return 0;
    }
    return await runHarness(options);
  } catch (error) {
    console.error(createRedactor()(error.message));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();
