import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const windows = process.platform === 'win32';
const optional = process.argv.includes('--if-installed');
const report = 'code-analyzer-results.json';
const plugin = '@salesforce/plugin-code-analyzer';

function runSf(args, options) {
  // npm installs sf as a .cmd launcher on Windows. All arguments are fixed literals.
  return windows ? spawnSync(`sf ${args.join(' ')}`, { ...options, shell: true }) : spawnSync('sf', args, options);
}

function checkProcess(result, command) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? result.signal}.`);
  }
}

function analyzerInstalled() {
  if (windows) {
    const directories = [process.cwd(), ...(process.env.PATH ?? '').split(';')];
    const launchers = ['sf.exe', 'sf.cmd', 'sf.bat'];
    if (!directories.some((directory) => launchers.some((name) => existsSync(join(directory, name))))) return false;
  }
  // The plugin list can exceed spawnSync's 1 MB default buffer.
  const result = runSf(['plugins', '--core', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') return false;
  if (result.stderr) process.stderr.write(result.stderr);
  checkProcess(result, 'sf plugins');
  const plugins = JSON.parse(result.stdout);
  return (plugins.result ?? plugins).some((entry) => entry.name === plugin && entry.type !== 'jit');
}

if (optional && !analyzerInstalled()) {
  console.log('Skipping Salesforce Code Analyzer because sf or its Code Analyzer plugin is missing.');
} else {
  // Keep this run's engine log separate so a concurrent scan cannot affect the result.
  const logDirectory = mkdtempSync(join(tmpdir(), 'wdb-analyzer-'));
  const env = { ...process.env, TEMP: logDirectory, TMP: logDirectory, TMPDIR: logDirectory };
  rmSync(report, { force: true });
  const result = runSf(
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
  );
  if (result.error) throw result.error;

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    // Engine errors such as CPD lexing failures can occur with zero reported violations.
    const logName = readdirSync(logDirectory).find((name) => /^sfca-\d.*\.log$/.test(name));
    if (!logName) throw new Error(`Code Analyzer did not write an engine log in ${logDirectory}.`);
    const logPath = join(logDirectory, logName);
    if (/^\[[^\]\r\n]+\] Error /im.test(readFileSync(logPath, 'utf8'))) {
      console.error(`Salesforce Code Analyzer reported an engine error. See ${logPath}.`);
      process.exitCode = 1;
    }
  }
}
