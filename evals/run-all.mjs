#!/usr/bin/env node
import { resolve } from 'node:path';
import { runNode } from './lib/assert.mjs';

const suites = [
  'structure/run.mjs',
  'diagrams/run.mjs',
  'fact-audit/run.mjs',
  'bypage-doc/run.mjs',
  '../scripts/lib/planners-modules-install.test.mjs',
];
for (const suite of suites) {
  process.stdout.write('\n=== ' + suite + ' ===\n');
  const target = resolve(import.meta.dirname, suite);
  const result = suite.endsWith('.test.mjs') ? runNode('--test', [target]) : runNode(target);
  process.stdout.write(result.stdout);
}
process.stdout.write(`\n${suites.length}/${suites.length} public suites passed\n`);
