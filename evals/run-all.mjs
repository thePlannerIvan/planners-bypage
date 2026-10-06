#!/usr/bin/env node
import { resolve } from 'node:path';
import { runNode } from './lib/assert.mjs';

const suites = ['structure/run.mjs', 'review/run.mjs', 'review/edits.mjs', 'review/structure-edits.mjs', 'assets/run.mjs', 'fact-audit/run.mjs', 'handoff/run.mjs'];
for (const suite of suites) {
  process.stdout.write('\n=== ' + suite + ' ===\n');
  const result = runNode(resolve(import.meta.dirname, suite));
  process.stdout.write(result.stdout);
}
process.stdout.write('\n' + suites.length + '/' + suites.length + ' public suites passed\n');
