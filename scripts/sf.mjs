import { execFileSync } from 'node:child_process';

export function runSf(args, options) {
  const jsonArgs = [...args, '--json'];
  if (process.platform !== 'win32') return execFileSync('sf', jsonArgs, options);

  // Salesforce CLI is installed as a .cmd shim on Windows.
  if (jsonArgs.some((arg) => !/^[a-z\d@._+/=-]+$/i.test(arg))) {
    throw new Error('Salesforce CLI arguments must be simple tokens on Windows.');
  }
  return execFileSync('cmd.exe', ['/d', '/c', 'sf ' + jsonArgs.join(' ')], options);
}
