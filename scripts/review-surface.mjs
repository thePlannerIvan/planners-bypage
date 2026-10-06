#!/usr/bin/env node
/**
 * 逐页审阅面的 **surface 文档**（业务）＋写盘＋校验。宿主生命周期不在这里。
 *
 * 分工（照 `planners-review-core/references/design-and-porting-rules.md`）：
 *   · 这个文件知道"页面在哪、serve 哪棵树、反馈写进哪个文件、唤醒说什么"——**只有这里知道**；
 *   · 起/复用/判死活/停宿主归公共模组（`planners-review-core` 的宿主生命周期，
 *     收在模组里那一份，本 Skill **不复制**）；
 *   · 反馈文件的形状与决定词表是本 Skill 的语义，宿主一概不解释。
 *
 * 两个基准（R2）不能混：
 *   · surface 自己声明的路径（`project_root` / `dir` / `feedback`）→ 相对 **surface 文件**；
 *   · 页面里的资产引用（`assets/x.png`、`uploads/page-01/x.png`）→ 相对 **`dir`**，也就是审阅目录。
 *
 * `dir` 为什么是审阅目录本身（不是项目根）：页面、本地化图片、上传件三者都在审阅目录里，
 * 最近公共祖先就是它。**被 serve 的树越小越好** —— 模组已知的"暴露面"缺口在这里顺带被收窄。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { moduleScript } from './lib/planners-modules.mjs';

export const SURFACE_REL = 'review-surface.json';
/** 页面提交落在哪：**提交文件**，不是本 Skill 的原生记录。翻译在收件层（`review-inbox.mjs`）。 */
export const SUBMISSIONS_REL = 'review-submissions.json';
/** 本 Skill 的原生记录（agent 与所有 Validator 读的就是它）。 */
export const FEEDBACK_REL = 'review-feedback.json';
export const HISTORY_DIR = 'history';
export const ID = 'planners-bypage/bypage';

/**
 * 本 Skill 的两个审阅面。**只有这两处不同**：`id`、tab 上的标题、唤醒语指向哪份文档。
 * 页面同一份、宿主同一份、收件同一份 —— 形状差异归各自的面，缝不认识"页"或"章节"。
 */
export const SURFACES = {
  bypage: {
    id: ID,
    title: '完整 By-page 图文审阅',
    description: '逐页看完整图文稿：默认通过，只标记有问题的页；事实例外与上一轮要求修改的页必须明确选择。',
    wake: '逐页审阅有新的提交（{unit}）：先跑 scripts/review-inbox.mjs 收件'
      + '（它会把这份提交翻译成 review-feedback.json 并追加 history/round-NN.json），'
      + '再按 stages/07-fact-audit-review.md 处理。',
  },
  storyline: {
    id: 'planners-bypage/storyline',
    title: 'Storyline 与页面架构审阅',
    description: '一起判断章节推进、页面任务与图片候选；默认通过，改过图片或写过反馈的页自动转为需要修改。',
    wake: 'Storyline 审阅有新的提交（{unit}）：先跑 scripts/review-inbox.mjs 收件'
      + '（它会把这份提交翻译成 review-feedback.json 并追加 history/round-NN.json），'
      + '再按 stages/04-storyline-review.md 处理，并按需要用 import-review-assets.mjs 把上传图写进 Asset Manifest。',
  },
};

/**
 * `project_root`：包含性校验用。**相对 surface 文件**。
 * 按本 Skill 的目录约定（`<project>/.bypage-work/reviews/<kind>/`）算到项目根；
 * 目录约定被改掉时退一级（一定是存在的祖先），不假装知道项目根在哪。
 */
export function projectRootRel(reviewDir) {
  const parts = resolve(reviewDir).split(/[\\/]/).filter(Boolean);
  const looksStandard = parts.at(-2) === 'reviews' && parts.at(-3) === '.bypage-work';
  return looksStandard ? '../../..' : '..';
}

export function surfacePath(reviewDir) {
  return join(resolve(reviewDir), SURFACE_REL);
}

export function submissionsPath(reviewDir) {
  return join(resolve(reviewDir), SUBMISSIONS_REL);
}

export function feedbackPath(reviewDir) {
  return join(resolve(reviewDir), FEEDBACK_REL);
}

export function historyDir(reviewDir) {
  return join(resolve(reviewDir), HISTORY_DIR);
}

/**
 * 这一份 surface 的内容。
 * `wake.text` 里那句话是给**模型**的：说清"先收件、再按哪份文档处理"。
 * 粒度（R10）：bypage 一次提交整份逐页稿，所以页面的 unit 是「整套」；
 * 页面仍然允许"不针对任何一页、只说一句整体意见"（`overall_feedback_zh` 一直都在）。
 */
export function surfaceDocument(reviewDir, { surface = 'bypage', title, description = '' } = {}) {
  const spec = SURFACES[surface];
  if (!spec) throw new Error('不认识的面：' + surface + '（只有 ' + Object.keys(SURFACES).join('、') + '）');
  return {
    contract_version: 'review-surface/2.0.0',
    id: spec.id,
    title: title || spec.title,
    description: description || spec.description,
    project_root: projectRootRel(reviewDir),
    dir: '.',
    entry: 'index.html',
    feedback: SUBMISSIONS_REL,
    draft: existsSync(join(reviewDir,'review-context.json')) ? JSON.parse(readFileSync(join(reviewDir,'review-context.json'),'utf8')).draftPath || 'draft.json' : 'draft.json',
    wake: { mode: 'queue', text: spec.wake },
    // 页面要往审阅目录里上传替换图片（宿主必须做包含性校验）。声明为空就是为空。
    capabilities: ['asset-upload','draft'],
    watch: ['review-snapshot.json'],
  };
}

/** 建文档 → 落盘（幂等：内容没变就不碰 mtime）。 */
export function writeSurface(reviewDir, options) {
  const path = surfacePath(reviewDir);
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify(surfaceDocument(reviewDir, options), null, 2) + '\n';
  if (!existsSync(path) || readFileSync(path, 'utf8') !== payload) writeFileSync(path, payload, 'utf8');
  return path;
}

/** 跑公共模组的**唯一校验器**（Node CLI，两种宿主共用同一份）。不合规就抛，不自己解释一遍。 */
export function validateSurface(reviewDir) {
  const path = surfacePath(reviewDir);
  if (!existsSync(path)) throw new Error('还没有审阅面：先写 surface，写出 ' + path);
  const result = spawnSync(process.execPath, [moduleScript('planners-review-core', 'scripts/validate-surface.mjs'), path, '--text'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('审阅面不合规（' + path + '）：\n' + (result.stdout || result.stderr).trim());
  return { ok: true, output: (result.stdout || '').trim() };
}

/** DSH 侧栏挂载用：surface 的**绝对路径**（宿主只收这个）。 */
export function surfaceOnly(reviewDir, options) {
  const surface = writeSurface(reviewDir, options);
  const report = validateSurface(reviewDir);
  return {
    status: 'surface_ready',
    surface: resolve(surface),
    entry: resolve(reviewDir, 'index.html'),
    submissions: resolve(reviewDir, SUBMISSIONS_REL),
    host_started: false,
    validator: report.output.split('\n').at(-1),
    next_action_zh: '把 surface 的绝对路径交给宿主的 review_open 工具（有插件时）；'
      + '没有那个工具时用模组的无插件宿主：node <planners-review-core>/scripts/serve-review.mjs "<surface>"',
  };
}


export function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i]] = argv[i + 1];
  if (!args['--review-dir']) {
    process.stdout.write(JSON.stringify({ ok: false, error: '用法：review-surface.mjs --review-dir <审阅目录> [--kind sample|final]' }) + '\n');
    return 2;
  }
  const reviewDir = resolve(args['--review-dir']);
  const kind = args['--kind'] || 'final';
  const title = kind === 'sample' ? '代表性样页校准' : '完整 By-page 图文审阅';
  try {
    const result = surfaceOnly(reviewDir, { title });
    process.stdout.write(JSON.stringify({ ok: true, kind, ...result }, null, 1) + '\n');
    return 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(error.message || error) }, null, 1) + '\n');
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}

/** 收件层要用的一个小子集：把 surface 里声明的路径解析成绝对路径（相对 surface 文件）。 */
export function resolveSurfacePaths(surfaceFile) {
  const surface = resolve(surfaceFile);
  const doc = JSON.parse(readFileSync(surface, 'utf8'));
  const base = dirname(surface);
  const dir = resolve(base, String(doc.dir || '.'));
  return {
    surface,
    doc,
    dir,
    entry: resolve(dir, String(doc.entry)),
    submissions: doc.feedback ? resolve(base, String(doc.feedback)) : null,
    projectRoot: resolve(base, String(doc.project_root || '.')),
    contentHash: createHash('sha256').update(readFileSync(surface)).digest('hex').slice(0, 12),
    reviewDirRel: relative(base, dir) || '.',
  };
}
