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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moduleScript } from './lib/planners-modules.mjs';
import { feedbackPath, submissionsPath, surfaceOnly, surfacePath, writeSurface  } from './review-surface.mjs';

const { openReview } = await import(moduleScript('planners-review-core', 'scripts/review-host.mjs'));
function workbenchReport(reviewDir, sourceHash) {
  const context = JSON.parse(readFileSync(join(reviewDir, 'review-context.json'), 'utf8'));
  return { workbench: true, review_context: resolve(reviewDir, 'review-context.json'),
    workbench_dir: resolve(reviewDir, 'workbench'), workbench_head: resolve(reviewDir, 'workbench/head.json'),
    canonical_path: context.files?.[0]?.path || context.architecturePath || null,
    source_hash: sourceHash, pending_tasks: resolve(reviewDir, 'workbench/head.json') };
}

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const key = argv[i];
  if (!key?.startsWith('--')) continue;
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true;
  else { args[key] = next; i += 1; }
}
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
if (args['--legacy-review'] === 'true') command.push('--legacy-review', 'true');
const built = spawnSync(process.execPath, command, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (built.status !== 0) throw new Error(built.stdout || built.stderr);
const priorRoundReused = existsSync(previousRound);

writeSurface(reviewDir, { surface: 'storyline' });

if (process.argv.includes('--surface-only') || process.argv.includes('--no-host')) {
  const surface = surfaceOnly(reviewDir, { surface: 'storyline' });
  const payload = { valid: true, prior_round_reused: priorRoundReused, ...surface };
  if (args['--legacy-review'] === 'true') Object.assign(payload, { source_hash: JSON.parse(readFileSync(join(reviewDir, 'review-context.json'), 'utf8')).sourceSha256,
    submissions_path: submissionsPath(reviewDir), feedback_path: feedbackPath(reviewDir) });
  else Object.assign(payload, workbenchReport(reviewDir, JSON.parse(readFileSync(join(reviewDir, 'review-context.json'), 'utf8')).sourceSha256));
  process.stdout.write(JSON.stringify(payload) + '\n');
} else {
  // 开浏览器归模组（openReview 的第三个参数，已统一进 Node CLI）；
  // 本 Skill 只决定这一次要不要开：--no-open 与无头环境都不开。
  const shouldOpen = !process.argv.includes('--no-open') && process.env.REVIEW_TEST_NO_OPEN !== '1';
  const state = await openReview(surfacePath(reviewDir), args['--port'] === undefined ? 0 : Number(args['--port']), shouldOpen);
  const payload = {
    valid: true,
    status: args['--legacy-review'] === 'true' ? 'waiting_for_human' : 'workbench_ready',
    opened: state.url,
    url: state.url,
    port: state.port,
    pid: state.pid,
    started: state.started,
    reused: state.reused,
    opened: state.opened,
    surface: state.surface,
    prior_round_reused: priorRoundReused,
  };
  if (args['--legacy-review'] === 'true') Object.assign(payload, { submissions_path: submissionsPath(reviewDir), feedback_path: feedbackPath(reviewDir),
    next_action_zh: '请在网页提交；然后跑 scripts/review-inbox.mjs 收件，再跑 validate-storyline-review-feedback.mjs。' });
  else Object.assign(payload, workbenchReport(reviewDir, JSON.parse(readFileSync(join(reviewDir, 'review-context.json'), 'utf8')).sourceSha256), {
    next_action_zh: '打开工作台后，先读取 review-context.json 与 canonical_path；Storyline 的保存会回写同一份结构主稿。需要处理反馈时读取 workbench/head.json 的 pending tasks，并按 task 的 revision/source_hash 修改；保存不是批准。'
  });
  process.stdout.write(JSON.stringify(payload) + '\n');
}
