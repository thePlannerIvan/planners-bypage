#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderPageReviewHtml } from './review/page-review-html.mjs';
import { pageDefaults, readPriorRound, seedAssetDecisions } from './lib/prior-round.mjs';
import {sha256,writeReviewContext} from './lib/review-edits.mjs';
import {copyScalar} from './lib/copy-scalars.mjs';

function argsOf(argv) { const out = {}; for (let i = 0; i < argv.length; i += 2) out[argv[i]] = argv[i + 1]; return out; }
function clean(value) { return copyScalar(value); }
function scalar(frontmatter, key) { return clean(frontmatter.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'))?.[1] ?? ''); }
function splitPages(content) {
  return [...content.replace(/\r\n/g, '\n').matchAll(/(?:^|\n)---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\ncontract_version:|$)/g)]
    .map(match => ({ frontmatter: match[1], body: match[2] }));
}
function section(body, name, nextName = null) {
  const end = nextName ? '(?=\\n##\\s*' + nextName + ')' : '$';
  return body.match(new RegExp('##\\s*' + name + '\\s*\\n([\\s\\S]*?)' + end, 'i'))?.[1]?.trim() ?? '';
}
const args = argsOf(process.argv.slice(2));
if (!args['--copy'] || !args['--output']) throw new Error('用法：build-bypage-review.mjs --copy <bypage-draft.md> --output <review/index.html> [--audit fact-audit.json] [--assets asset-manifest.json] [--kind sample|final] [--previous review-feedback.json]');
const copyPath = resolve(args['--copy']);
const outputPath = resolve(args['--output']);
const kind = args['--kind'] || 'final';
const reviewKind = kind === 'sample' ? 'bypage_sample' : 'bypage';
// 上一轮**人**做过的决定（只在同一个面之间带）。读不到＝第一轮，行为与原来完全一致。
const priorRound = readPriorRound(args['--previous'] ? resolve(args['--previous']) : null, reviewKind);
if (kind === 'final' && !args['--assets']) throw new Error('完整 By-page 终审必须提供 --assets，并通过图片视觉检查门禁');
if (kind === 'final' && !args['--audit']) throw new Error('完整 By-page 终审必须提供当前正式稿的 --audit');
const copyRaw = readFileSync(copyPath, 'utf8');
const validation = spawnSync(process.execPath, [resolve(dirname(fileURLToPath(import.meta.url)), 'validate-bypage.mjs'), copyPath], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (validation.status !== 0) throw new Error('逐页稿验证失败：' + (validation.stdout || validation.stderr));
if (args['--assets']) {
  const assetValidation = spawnSync(process.execPath, [
    resolve(dirname(fileURLToPath(import.meta.url)), 'validate-asset-manifest.mjs'),
    resolve(args['--assets']),
    ...(kind === 'final' ? ['--final'] : []),
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (assetValidation.status !== 0) throw new Error('图片资产尚未通过终审门禁：' + (assetValidation.stdout || assetValidation.stderr));
}
let auditRaw = '';
let audit = { facts: [] };
let factExceptions = [];
if (args['--audit']) {
  const auditPath = resolve(args['--audit']);
  if (!existsSync(auditPath)) throw new Error('事实审计不存在：' + auditPath);
  const result = spawnSync(process.execPath, [resolve(dirname(fileURLToPath(import.meta.url)), 'validate-fact-audit.mjs'), '--audit', auditPath, '--copy', copyPath, '--allow-human-review', 'true'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('事实语义核验尚未完成：' + (result.stdout || result.stderr));
  factExceptions = JSON.parse(result.stdout).human_review_required || [];
  auditRaw = readFileSync(auditPath, 'utf8');
  audit = JSON.parse(auditRaw);
}
const assetManifestPath = args['--assets'] ? resolve(args['--assets']) : null;
const assetRaw = assetManifestPath ? readFileSync(assetManifestPath, 'utf8') : '';
const sourceSha256 = createHash('sha256').update(copyRaw).update('\n---FACT-AUDIT---\n').update(auditRaw)
  .update(assetManifestPath ? '\n---ASSET-MANIFEST---\n' + assetRaw : '').digest('hex');
const auditByPage = new Map();
// fact-audit/1.0.0 的疑点清单带 location.page；按页归组给审阅页展示
for (const suspect of audit.suspects || []) {
  const page = Number(suspect.location?.page);
  if (!Number.isInteger(page)) continue;
  auditByPage.set(page, [...(auditByPage.get(page) || []), suspect]);
}
const exceptionsByPage = new Map();
for (const item of factExceptions) exceptionsByPage.set(Number(item.page_number), [...(exceptionsByPage.get(Number(item.page_number)) || []), item]);
const reviewAssetDir = resolve(dirname(outputPath), 'assets');
mkdirSync(reviewAssetDir, { recursive: true });
const imageMap = {};
function localizeImages(markdown) {
  return String(markdown).replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (whole, alt, rawTarget) => {
    const target = rawTarget.trim().replace(/^<|>$/g, '');
    if (/^https?:\/\//i.test(target)) return whole;
    const source = resolve(dirname(copyPath), target);
    if (!existsSync(source)) return whole;
    let destination = resolve(reviewAssetDir, basename(source));
    for (let index = 2; existsSync(destination) && !readFileSync(destination).equals(readFileSync(source)); index++) {
      const name = basename(source); const dot = name.lastIndexOf('.');
      destination = resolve(reviewAssetDir, dot > 0 ? name.slice(0, dot) + '-' + index + name.slice(dot) : name + '-' + index);
    }
    if (!existsSync(destination)) copyFileSync(source, destination);
    const local = relative(dirname(outputPath), destination).split('\\').join('/');
    imageMap[local] = rawTarget.trim();
    return '![' + alt + '](' + local + ')';
  });
}
const pages = splitPages(copyRaw).map(({ frontmatter, body }) => {
  const pageNumber = Number(scalar(frontmatter, 'page_number'));
  const facts = auditByPage.get(pageNumber) || [];
  const exceptions = exceptionsByPage.get(pageNumber) || [];
  return {
    page_number: pageNumber,
    title: scalar(frontmatter, 'page_title'),
    claim: scalar(frontmatter, 'main_message'),
    requires_fact_decision: exceptions.length > 0,
    fact_exceptions: exceptions,
    // 上一轮人做过的决定 → 这一页本轮要不要人重新明确选择（以及只读上下文）。
    ...pageDefaults(priorRound?.byPage.get(pageNumber), exceptions.length > 0),
    meta: [
      { label: '页面类型', value: scalar(frontmatter, 'page_type') },
      { label: '所属章节', value: scalar(frontmatter, 'section_id') },
    ],
    sections: [
      { label: '页面主体内容', value: localizeImages(section(body, 'Page Content', 'Speaker Notes')), format: 'markdown' },
      { label: '讲述备注', value: section(body, 'Speaker Notes', 'Production Notes'), collapsed: true },
      { label: '制作说明', value: section(body, 'Production Notes', 'Sources'), collapsed: true },
      { label: '来源', value: section(body, 'Sources'), collapsed: true },
      ...(facts.length ? [{
        label: '事实核查', editable:false,
        value: facts.map(item => [item.surface,item.finding,item.note].filter(Boolean).join('：')).join('\n\n'),
        collapsed: true,
      }] : []),
    ],
  };
});
const recheckPages = pages.filter(page => page.requires_recheck);
const context = writeReviewContext(dirname(outputPath),{type:'copy',reviewKind,sourceSha256,pages,sections:[],imageMap,assetManifestPath,
  files:[{path:copyPath,sha256:sha256(copyRaw)},...(args['--audit'] ? [{path:resolve(args['--audit']),sha256:sha256(auditRaw)}] : []),
    ...(args['--assets'] ? [{path:resolve(args['--assets']),sha256:sha256(readFileSync(resolve(args['--assets'])))}] : [])]});
const html = renderPageReviewHtml({
  reviewKind,
  title: kind === 'sample' ? '代表性样页校准' : '完整 By-page 图文审阅',
  subtitle: '请逐页检查 ' + pages.length + ' 页的标题、主要信息、完整主体、表格、图表说明和图片。',
  sourceSha256,
  draftPath:context.draftPath,
  pages,
  notice: reviewNotice(pages, factExceptions.length > 0, recheckPages.length),
  allowUploads: kind === 'final',
});
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, html);
process.stdout.write(JSON.stringify({ valid: true, kind, pages: pages.length, source_sha256: sourceSha256, output: outputPath, recheck_pages: recheckPages.map(page => page.page_number) }) + '\n');

/** 提示语只说自己真的知道的事：默认通过的页、必须人明确决定的页（事实例外 / 上一轮要求修改）。 */
function reviewNotice(pages, hasFactExceptions, recheckCount) {
  if (!hasFactExceptions && !recheckCount) return '全部页面默认通过。输入任何反馈后，本页自动切换为需要修改。';
  const parts = [];
  if (hasFactExceptions) parts.push('含事实例外的页面必须明确接受或退回修改');
  if (recheckCount) parts.push('上一轮你标了「需要修改」的 ' + recheckCount + ' 页必须复核后明确选择（点一下通过即可，不用先清空任何东西）');
  return '普通页面默认通过；' + parts.join('；') + '。';
}
