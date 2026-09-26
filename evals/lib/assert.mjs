import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function runNode(script, args = [], options = {}) {
  const { allowFailure = false, ...spawnOptions } = options;
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...spawnOptions,
  });
  // allowFailure：给"断言某件事**必须失败**"的用例用（例如 Validator 该拦下这份反馈）。
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${script} 失败\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
  return result;
}

export function jsonOutput(result) {
  const output = result.stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    const lines = output.split('\n').filter(Boolean);
    return JSON.parse(lines.at(-1));
  }
}

export function pass(name, details = '') {
  process.stdout.write(`✓ ${name}${details ? ` — ${details}` : ''}\n`);
}
