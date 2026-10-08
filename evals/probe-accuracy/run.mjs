#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]] = process.argv[i + 1];
const bypage = resolve(args['--bypage-root'] || resolve(import.meta.dirname, '../..'));
const modulesHome = args['--modules-home'] || process.env.PLANNERS_MODULES_HOME;
process.env.PLANNERS_NO_AUTO_INSTALL = '1';
if (modulesHome) process.env.PLANNERS_MODULES_HOME = resolve(modulesHome);
assert(existsSync(join(bypage, 'scripts/lib/planners-modules.mjs')), 'Supply --bypage-root until this directory is installed as evals/probe-accuracy/');
const { resolveModule } = await import(pathToFileURL(join(bypage, 'scripts/lib/planners-modules.mjs')));
const fact = realpathSync(args['--fact-root'] ? resolve(args['--fact-root']) : resolveModule('planners-fact-check'));
const sourceIndex = realpathSync(resolveModule('planners-source-index'));
const reviewCore = realpathSync(resolveModule('planners-review-core'));
const library = resolve(args['--library-root'] || resolve(sourceIndex, '../..'));
const outBase = args['--out'] ? resolve(args['--out']) : tmpdir();
mkdirSync(outBase, { recursive: true });
const runDir = mkdtempSync(join(outBase, 'planners-interface-eval-'));
const flatModules = join(runDir, 'modules');
mkdirSync(flatModules);
for (const [name, path] of [['planners-fact-check', fact], ['planners-source-index', sourceIndex], ['planners-review-core', reviewCore]]) {
  symlinkSync(path, join(flatModules, name), 'dir');
}
const common = ['--bypage-root', bypage, '--fact-root', fact, '--source-index-root', sourceIndex,
  '--review-core-root', reviewCore, '--library-root', library, '--modules-home', flatModules, '--out', runDir];
let failed = false;
function suite(name, options = []) {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, name), ...common, ...options], {
    encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PLANNERS_MODULES_HOME: flatModules, PLANNERS_NO_AUTO_INSTALL: '1' },
  });
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  if (run.error) process.stderr.write(run.error.message + '\n');
  if (run.status !== 0 || run.error) failed = true;
}
suite('probe-accuracy.mjs', ['--strict', 'true']);
if (args['--handoff'] === 'true') {
  const proposal = resolve(args['--proposal-root'] || join(library, '02-content-assembly/planners-proposal-system'));
  const ppt = resolve(args['--ppt-root'] || join(library, '03-design-delivery/planners-ppt-hell'));
  assert(existsSync(join(proposal, 'proposal-co-creation/scripts/validate-page-architectures.mjs')), 'Continuous handoff needs the actual Proposal implementation; supply --proposal-root');
  assert(existsSync(join(ppt, 'scripts/init_svg_project.py')), 'Continuous handoff needs the actual PPT Hell implementation; supply --ppt-root');
  suite('continuous-handoff.mjs', ['--proposal-root', proposal, '--ppt-root', ppt,
    ...(args['--python'] ? ['--python', args['--python']] : [])]);
} else {
  process.stdout.write('Continuous handoff not selected; add --handoff true when Proposal and PPT Hell are available.\n');
}
if (failed || args['--keep'] === 'true') {
  process.stdout.write(`Evidence retained: ${runDir}\n`);
} else {
  rmSync(runDir, { recursive: true, force: true });
  process.stdout.write('Interface accuracy regression passed; temporary test project cleaned.\n');
}
process.exitCode = failed ? 1 : 0;
