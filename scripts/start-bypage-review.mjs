#!/usr/bin/env node
/**
 * 逐页审阅面的**入口**：写 surface → 校验 → 打开。
 *
 * 起/复用/判死活/停干净**一行都不在这里** —— 那是公共模组
 * `planners-review-core/scripts/review-host.mjs` 的唯一实现（Node CLI，两种宿主共用一套判据）。
 * 本文件只做三件业务事：
 *
 *   1. 生成审阅页（`build-bypage-review.mjs`，含"上一轮人做过的决定"）；
 *   2. 建 surface 文档（页面在哪、serve 哪棵树、反馈写哪份文件、唤醒说什么）；
 *   3. 选路径 —— **有插件那条路不需要生命周期**：
 *        · `--surface-only`：只写 + 校验，报出 surface 的**绝对路径**，交给宿主的 `review_open`；
 *          一次 `start` 都不发生（测试里钉住了这一条）。
 *        · 默认：交给模组起/复用无插件宿主并打开页面。
 *
 * 两条路页面一个字都不用改（同一份页面、同一份桥）。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moduleScript } from './lib/planners-modules.mjs';
import { feedbackPath, submissionsPath, surfaceOnly, surfacePath, writeSurface  } from './review-surface.mjs';

// 公共模组的生命周期：**import 它，不重写任何判据**。
const { openReview } = await import(moduleScript('planners-review-core', 'scripts/review-host.mjs'));
function workbenchReport(reviewDir, sourceHash) {
  const context = JSON.parse(readFileSync(join(reviewDir, 'review-context.json'), 'utf8'));
  return { workbench: true, review_context: resolve(reviewDir, 'review-context.json'),
    workbench_dir: resolve(reviewDir, 'workbench'), workbench_head: resolve(reviewDir, 'workbench/head.json'),
    canonical_path: context.files?.[0]?.path || null,
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
for (const key of ['--copy', '--review-dir']) if (!args[key]) throw new Error('缺少 ' + key);
const kind = args['--kind'] || 'final';
if (kind === 'final' && !args['--assets']) throw new Error('完整 By-page 终审缺少 --assets');
const reviewDir = resolve(args['--review-dir']);
mkdirSync(reviewDir, { recursive: true });
// 上一轮人做过的决定：**必须在收件/归档之前读**。没有这个文件＝第一轮，构建行为与原来完全一致。
const previousRound = feedbackPath(reviewDir);
const title = kind === 'sample' ? '代表性样页校准' : '完整 By-page 图文审阅';
const command = [
  resolve(dirname(fileURLToPath(import.meta.url)), 'build-bypage-review.mjs'),
  '--copy', resolve(args['--copy']),
  '--output', join(reviewDir, 'index.html'),
  '--kind', kind,
];
if (args['--audit']) command.push('--audit', resolve(args['--audit']));
if (args['--assets']) command.push('--assets', resolve(args['--assets']));
if (args['--legacy-review'] === 'true') command.push('--legacy-review', 'true');
if (existsSync(previousRound)) command.push('--previous', previousRound);
const built = spawnSync(process.execPath, command, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (built.status !== 0) throw new Error(built.stdout || built.stderr);
const priorRoundReused = existsSync(previousRound);

writeSurface(reviewDir, { title });

if (process.argv.includes('--surface-only') || process.argv.includes('--no-host')) {
  const surface = surfaceOnly(reviewDir, { title });
  const payload = { valid: true, kind, prior_round_reused: priorRoundReused, ...surface };
  if (args['--legacy-review'] === 'true') Object.assign(payload, { submissions_path: submissionsPath(reviewDir), feedback_path: feedbackPath(reviewDir) });
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
    url: state.url,
    port: state.port,
    pid: state.pid,
    started: state.started,
    reused: state.reused,
    // 如实报"这次开没开浏览器"（模组语义：open 默认开，--no-open / 无头环境关）
    opened: state.opened,
    surface: state.surface,
    prior_round_reused: priorRoundReused,
  };
  if (args['--legacy-review'] === 'true') Object.assign(payload, { submissions_path: submissionsPath(reviewDir), feedback_path: feedbackPath(reviewDir),
    next_action_zh: '请在网页提交；然后跑 scripts/review-inbox.mjs 收件，再跑 validate-review-feedback.mjs。' });
  else Object.assign(payload, workbenchReport(reviewDir, JSON.parse(readFileSync(join(reviewDir, 'review-context.json'), 'utf8')).sourceSha256), {
    next_action_zh: '打开工作台后，先读取 review-context.json 与 canonical_path；文字、页序和图片保存会回写同一份逐页主稿。需要处理反馈时读取 workbench/head.json 的 pending tasks，并按 task 的 revision/source_hash 修改；保存不是批准。'
  });
  process.stdout.write(JSON.stringify(payload) + '\n');
}
