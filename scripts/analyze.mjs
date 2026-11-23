import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSf } from './sf.mjs';

const optional = process.argv.includes('--if-installed');
const report = 'code-analyzer-results.json';
const plugin = '@salesforce/plugin-code-analyzer';

function analyzerInstalled() {
  let stdout;
  try {
    stdout = runSf(['plugins', '--core'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error('sf plugins failed.', { cause: error });
  }

  let plugins;
  try {
    const payload = JSON.parse(stdout);
    plugins = payload.result ?? payload;
    if (!Array.isArray(plugins)) throw new Error('Expected a plugin list.');
  } catch (error) {
    throw new Error('sf plugins did not return a valid JSON plugin list.', { cause: error });
  }
  return plugins.some((entry) => entry.name === plugin && entry.type !== 'jit');
}

function analyze() {
  // Keep this run's engine log separate so concurrent scans cannot affect the result.
  const logDirectory = mkdtempSync(join(tmpdir(), 'wdb-analyzer-'));
  try {
    const env = { ...process.env, TEMP: logDirectory, TMP: logDirectory, TMPDIR: logDirectory };
    rmSync(report, { force: true });
    try {
      runSf(
        [
          'code-analyzer',
          'run',
          '--workspace',
          '.',
          '--target',
          'sfdx-source',
          '--target',
          'scripts',
          '--severity-threshold',
          '5',
          '--output-file',
          report,
          '--view',
          'table',
        ],
        { env, stdio: 'inherit' },
        { json: false },
      );
    } catch (error) {
      if (!Number.isInteger(error.status)) throw error;
      process.exitCode = error.status;
      return;
    }

    // Engine failures can occur with zero reported violations.
    const logName = readdirSync(logDirectory).find((name) => /^sfca-\d.*\.log$/.test(name));
    if (!logName) throw new Error('Code Analyzer did not write an engine log.');
    const errors = readFileSync(join(logDirectory, logName), 'utf8').match(/^\[[^\]\r\n]+\] Error .+$/gim);
    if (errors) {
      console.error(`Salesforce Code Analyzer reported an engine error:\n${errors.join('\n')}`);
      process.exitCode = 1;
    }
  } finally {
    rmSync(logDirectory, { recursive: true, force: true });
  }
}

if (optional && !analyzerInstalled()) {
  console.log('Skipping Salesforce Code Analyzer because sf or its Code Analyzer plugin is missing.');
} else {
  analyze();
}
