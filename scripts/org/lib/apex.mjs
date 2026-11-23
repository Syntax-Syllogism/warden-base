import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function soqlLiteral(value) {
  return "'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
}

export function createApex({ sfJson, org, users = new Map() }) {
  function soql(query) {
    return sfJson(['data', 'query', '--target-org', org, '--query', query]).result.records;
  }
  function runAnonymous(source, { asUser } = {}) {
    if (asUser && !users.has(asUser)) throw new Error(`Unknown identity key: ${asUser}`);
    const dir = mkdtempSync(join(tmpdir(), 'warden-apex-'));
    try {
      const file = join(dir, 'anonymous.apex');
      writeFileSync(file, existsSync(source) ? readFileSync(source, 'utf8') : source, { mode: 0o600 });
      const result = sfJson(['apex', 'run', '--target-org', asUser ? users.get(asUser) : org, '--file', file]);
      if (result.result.success !== true) {
        throw new Error(result.result.exceptionMessage || result.result.compileProblem || 'Anonymous Apex failed');
      }
      return result.result;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { soql, runAnonymous };
}
