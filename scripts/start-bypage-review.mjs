#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchReviewSession } from './review/review-launcher.mjs';

const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 2) args[process.argv.slice(2)[i]] = process.argv.slice(2)[i + 1];
for (const key of ['--copy', '--review-dir']) if (!args[key]) throw new Error('缺少 ' + key);
if ((args['--kind'] || 'final') === 'final' && !args['--assets']) throw new Error('完整 By-page 终审缺少 --assets');
const reviewDir = resolve(args['--review-dir']);
mkdirSync(reviewDir, { recursive: true });
const command = [
  resolve(dirname(fileURLToPath(import.meta.url)), 'build-bypage-review.mjs'),
  '--copy', resolve(args['--copy']),
  '--output', join(reviewDir, 'index.html'),
  '--kind', args['--kind'] || 'final',
];
if (args['--audit']) command.push('--audit', resolve(args['--audit']));
if (args['--assets']) command.push('--assets', resolve(args['--assets']));
const built = spawnSync(process.execPath, command, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (built.status !== 0) throw new Error(built.stdout || built.stderr);
const session = launchReviewSession({
  reviewDir,
  feedbackPath: join(reviewDir, 'review-feedback.json'),
  assetsDir: join(reviewDir, 'uploads'),
  finalMdPath: args['--final-md'] ? resolve(args['--final-md']) : null,
  port: args['--port'] === undefined ? 0 : Number(args['--port']),
});
process.stdout.write(JSON.stringify({ valid: true, status: 'waiting_for_human', opened: session.url, feedback_path: session.feedback_path, next_action_zh: '请在网页保存审阅，然后回到 Codex 发送“已完成”。' }) + '\n');
