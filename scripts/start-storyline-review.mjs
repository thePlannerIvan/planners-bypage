#!/usr/bin/env node
/**
 * Storyline 审阅面的入口 —— 与逐页面**同一份**缝、同一份页面、同一份收件。
 *
 * 生命周期一行都不在这里（公共模组 `planners-review-core/scripts/review-host.mjs`）。
 * 两面只有三处不同：surface 的 `id`、tab 标题、唤醒语指向哪份文档（见 `review-surface.mjs` 的 `SURFACES`）。
 *
 * `--surface-only`：只写 + 校验，报出 surface 绝对路径交给宿主的 `review_open`；**不起宿主**。
 * 默认：交给模组起/复用无插件宿主并打开页面。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moduleScript } from './lib/planners-modules.mjs';
import { feedbackPath, submissionsPath, surfaceOnly, surfacePath, writeSurface  } from './review-surface.mjs';

const { openReview } = await import(moduleScript('planners-review-core', 'scripts/review-host.mjs'));

const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 2) args[process.argv.slice(2)[i]] = process.argv.slice(2)[i + 1];
for (const key of ['--architecture', '--assets', '--review-dir']) if (!args[key]) throw new Error('缺少 ' + key);
const reviewDir = resolve(args['--review-dir']);
mkdirSync(reviewDir, { recursive: true });
// 上一轮人做过的决定（页面决定 + 逐张图片状态）：必须在收件/归档之前读。
const previousRound = feedbackPath(reviewDir);
const command = [
  resolve(dirname(fileURLToPath(import.meta.url)), 'build-storyline-review.mjs'),
  '--architecture', resolve(args['--architecture']),
  '--assets', resolve(args['--assets']),
  '--output', join(reviewDir, 'index.html'),
];
if (existsSync(previousRound)) command.push('--previous', previousRound);
const built = spawnSync(process.execPath, command, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (built.status !== 0) throw new Error(built.stdout || built.stderr);
const priorRoundReused = existsSync(previousRound);

writeSurface(reviewDir, { surface: 'storyline' });

if (process.argv.includes('--surface-only') || process.argv.includes('--no-host')) {
  const surface = surfaceOnly(reviewDir, { surface: 'storyline' });
  process.stdout.write(JSON.stringify({ valid: true, prior_round_reused: priorRoundReused, ...surface }) + '\n');
} else {
  // 开浏览器归模组（openReview 的第三个参数，已统一进 Node CLI）；
  // 本 Skill 只决定这一次要不要开：--no-open 与无头环境都不开。
  const shouldOpen = !process.argv.includes('--no-open') && process.env.REVIEW_TEST_NO_OPEN !== '1';
  const state = await openReview(surfacePath(reviewDir), args['--port'] === undefined ? 0 : Number(args['--port']), shouldOpen);
  process.stdout.write(JSON.stringify({
    valid: true,
    status: 'waiting_for_human',
    opened: state.url,
    url: state.url,
    port: state.port,
    pid: state.pid,
    started: state.started,
    reused: state.reused,
    opened: state.opened,
    surface: state.surface,
    submissions_path: submissionsPath(reviewDir),
    feedback_path: feedbackPath(reviewDir),
    prior_round_reused: priorRoundReused,
    next_action_zh: '请在网页保存审阅；然后跑 scripts/review-inbox.mjs 收件，再跑 validate-storyline-review-feedback.mjs。',
  }) + '\n');
}
