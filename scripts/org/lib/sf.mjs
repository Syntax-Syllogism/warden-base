import { runSf } from '../../sf.mjs';

export { sfLauncher } from '../../sf.mjs';

const runSync = (_bin, args, options) => runSf(args, options);
const DETAIL_LIMIT = 4000;

function bounded(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > DETAIL_LIMIT ? text.slice(0, DETAIL_LIMIT) + '…' : text;
}

// Anonymous Apex, deploy and test failures often omit the top-level message.
export function sfFailureDetail(payload = {}) {
  const result = payload.result && typeof payload.result === 'object' ? payload.result : {};
  const failures =
    result.failures ?? result.details?.componentFailures ?? result.tests?.filter?.((test) => test.Outcome === 'Fail');
  const detail = {
    exceptionMessage: result.exceptionMessage,
    exceptionStackTrace: result.exceptionStackTrace,
    compileProblem: result.compileProblem,
    line: result.line,
    column: result.column,
    failures: failures && (!Array.isArray(failures) || failures.length) ? bounded(failures) : undefined,
    stderr: payload.stderr ? bounded(payload.stderr) : undefined,
  };
  for (const key of Object.keys(detail))
    if (detail[key] === undefined || detail[key] === null || detail[key] === '') delete detail[key];
  return detail;
}

export class SfError extends Error {
  constructor(payload, status = 1, command = []) {
    const detail = sfFailureDetail(payload);
    super(
      payload.message ??
        detail.exceptionMessage ??
        detail.compileProblem ??
        (detail.failures && `Failures: ${detail.failures}`) ??
        'Salesforce CLI command failed',
    );
    this.name = payload.name ?? 'SfError';
    this.status = payload.status ?? status;
    this.command = command;
    this.detail = detail;
    this.payload = payload;
  }
}

// Keep raw CLI output off the terminal, including failures and plugin warnings.
export function createSfJson({ execute = runSync, onResult = () => {} } = {}) {
  return (args) => {
    let stdout;
    let failure;
    try {
      stdout = execute('sf', [...args, '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      failure = error;
      stdout = error.stdout;
    }
    let payload;
    try {
      payload = JSON.parse(String(stdout));
      if (!payload || typeof payload !== 'object' || !Number.isInteger(payload.status)) {
        throw new Error('Invalid Salesforce JSON envelope');
      }
    } catch {
      payload = {
        status: failure?.status ?? 1,
        name: 'SfInvalidResponse',
        message: 'Salesforce CLI did not return JSON',
        stdout: String(stdout ?? ''),
        stderr: String(failure?.stderr ?? ''),
      };
    }
    onResult({ command: args.slice(0, 3), ...payload });
    if (failure || payload.status !== 0) {
      throw new SfError(
        {
          stderr: failure?.stderr ? String(failure.stderr) : undefined,
          ...payload,
        },
        failure?.status ?? 1,
        args.slice(0, 3),
      );
    }
    return payload;
  };
}
