import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const sensitiveKey = /username|password|token|authurl|sfdxurl|authorization|clientsecret|privatekey/i;

export function createRedactor() {
  const secrets = new Set();
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (sensitiveKey.test(key) && typeof child === 'string' && child.length > 3) {
        secrets.add(child);
      } else collect(child);
    }
  }
  function clean(value) {
    if (typeof value === 'string') {
      let text = value;
      for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
        text = text.replaceAll(secret, '[REDACTED]');
      }
      return text
        .replace(/force:\/\/[^\s"'<>]+/gi, '[REDACTED]')
        .replace(/https?:\/\/[^\s"'<>]*(?:[?@])[^\s"'<>]*/gi, '[REDACTED URL]')
        .replace(/\b[^\s"'<>@]+@[^\s"'<>@]+\.[a-z0-9.-]+/gi, '[REDACTED USER]')
        .replace(/\b00D[a-zA-Z0-9]{12,15}![a-zA-Z0-9._!-]+/g, '[REDACTED TOKEN]')
        .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]');
    }
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : clean(child)]),
      );
    }
    return value;
  }
  return (value) => {
    collect(value);
    return clean(value);
  };
}

export function trimLog(text, maxLines = 200, maxBytes = 256 * 1024) {
  const lines = String(text).split('\n').slice(-maxLines).join('\n');
  let tail = Buffer.from(lines).subarray(-maxBytes).toString('utf8');
  // A slice through a multibyte character must not exceed the byte limit.
  while (Buffer.byteLength(tail) > maxBytes) tail = tail.slice(1);
  return tail;
}

export function writeArtifact(folder, name, data, redact) {
  const target = resolve(folder, name);
  if (!target.startsWith(resolve(folder) + sep)) throw new Error('Artifact path escapes evidence folder');
  const safe = redact(data);
  let text = typeof safe === 'string' ? safe : JSON.stringify(safe, null, 2);
  const tail = trimLog(text, typeof safe === 'string' ? 199 : Infinity, 256 * 1024 - 1);
  if (tail !== text) {
    text =
      typeof safe === 'string'
        ? tail
        : JSON.stringify({ truncated: true, tail: trimLog(text, 180, 32 * 1024) }, null, 2);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text + '\n');
}

export function renderSummary(summary) {
  const checks = summary.checks.map(
    (check) =>
      `- ${check.outcome}: ${check.name}${check.detail ? ` — ${String(check.detail).replace(/\s*\r?\n\s*/g, ' ')}` : ''}`,
  );
  return [
    `# Org evidence: ${summary.scenario}`,
    '',
    `Outcome: **${summary.outcome}**`,
    '',
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt}`,
    `Commit: ${summary.commit}${summary.dirty ? ' (dirty)' : ''}`,
    `Package version: ${summary.packageVersion}`,
    `Security type: ${summary.securityType}`,
    '',
    '## Checks',
    '',
    ...(checks.length ? checks : ['No checks completed.']),
    '',
    '## Metrics',
    '',
    '```json',
    JSON.stringify(summary.metrics, null, 2),
    '```',
    '',
  ].join('\n');
}
