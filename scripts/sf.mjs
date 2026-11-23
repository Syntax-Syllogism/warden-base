import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function locateWindowsSf() {
  return (process.env.PATH ?? '')
    .split(';')
    .filter(Boolean)
    .flatMap((directory) => ['sf.exe', 'sf.cmd'].map((name) => join(directory.replace(/^"|"$/g, ''), name)))
    .filter(existsSync);
}

// On Windows, sf is an npm .cmd shim that execFile cannot start without a
// shell, and a shell would split SOQL and Apex arguments. Run the CLI's own
// entry script with Node instead, so every argument reaches it unchanged.
export function sfLauncher(
  args,
  { platform = process.platform, nodePath = process.execPath, locate = locateWindowsSf, exists = existsSync } = {},
) {
  if (platform !== 'win32') return ['sf', args];
  let shims = [];
  try {
    shims = locate();
  } catch {
    shims = [];
  }
  for (const shim of shims) {
    const path = shim.trim();
    if (path.toLowerCase().endsWith('.exe')) return [path, args];
    const entry = join(dirname(path), 'node_modules', '@salesforce', 'cli', 'bin', 'run.js');
    if (exists(entry)) return [nodePath, ['--no-deprecation', entry, ...args]];
  }
  const error = new Error(
    'Salesforce CLI entry script not found next to sf.cmd; install it with npm i -g @salesforce/cli',
  );
  if (shims.length === 0) error.code = 'ENOENT';
  throw error;
}

let launcher;
export function runSf(args, options, { json = true } = {}) {
  launcher ??= sfLauncher([]);
  const [bin, prefix] = launcher;
  const sfArgs = json && !args.includes('--json') ? [...args, '--json'] : args;
  return execFileSync(bin, [...prefix, ...sfArgs], options);
}
