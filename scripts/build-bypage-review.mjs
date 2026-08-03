#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderPageReviewHtml } from './review/page-review-html.mjs';

function argsOf(argv) { const out = {}; for (let i = 0; i < argv.length; i += 2) out[argv[i]] = argv[i + 1]; return out; }
function clean(value) { return String(value ?? '').trim().replace(/^["']|["']$/g, ''); }
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
if (!args['--copy'] || !args['--output']) throw new Error('用法：build-bypage-review.mjs --copy <bypage-draft.md> --output <review/index.html> [--audit fact-audit.json] [--assets asset-manifest.json] [--kind sample|final]');
const copyPath = resolve(args['--copy']);
const outputPath = resolve(args['--output']);
const kind = args['--kind'] || 'final';
if (kind === 'final' && !args['--assets']) throw new Error('完整 By-page 终审必须提供 --assets，并通过图片视觉检查门禁');
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
const sourceSha256 = createHash('sha256').update(copyRaw).update('\n---FACT-AUDIT---\n').update(auditRaw).digest('hex');
const auditByPage = new Map();
for (const fact of audit.facts || []) auditByPage.set(Number(fact.page_number), [...(auditByPage.get(Number(fact.page_number)) || []), fact]);
const exceptionsByPage = new Map();
for (const item of factExceptions) exceptionsByPage.set(Number(item.page_number), [...(exceptionsByPage.get(Number(item.page_number)) || []), item]);
const reviewAssetDir = resolve(dirname(outputPath), 'assets');
mkdirSync(reviewAssetDir, { recursive: true });
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
    return '![' + alt + '](' + relative(dirname(outputPath), destination).split('\\').join('/') + ')';
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
    meta: [
      { label: '页面类型', value: scalar(frontmatter, 'page_type') },
      { label: '所属章节', value: scalar(frontmatter, 'section_id') },
    ],
    sections: [
      { label: '页面主体内容', value: localizeImages(section(body, 'Page Content', 'Speaker Notes')), format: 'markdown' },
      { label: 'Speaker Notes', value: section(body, 'Speaker Notes', 'Production Notes'), collapsed: true },
      { label: '制作说明', value: section(body, 'Production Notes', 'Sources'), collapsed: true },
      { label: '来源', value: section(body, 'Sources'), collapsed: true },
      {
        label: '最终实际使用事实',
        value: facts.length ? facts.map(item => item.fact_id + ' · ' + (item.semantic_status || 'pending') + ' · ' + item.claim_text).join('\n\n') : '本页没有需要外部核对的实际使用事实。',
        collapsed: true,
      },
    ],
  };
});
const html = renderPageReviewHtml({
  reviewKind: kind === 'sample' ? 'bypage_sample' : 'bypage',
  title: kind === 'sample' ? '代表性样页校准' : '完整 By-page 图文审阅',
  subtitle: '请逐页检查 ' + pages.length + ' 页的标题、主要信息、完整主体、表格、图表说明和图片。',
  sourceSha256,
  pages,
  notice: factExceptions.length ? '普通页面默认通过；含事实例外的页面必须明确接受或退回修改。' : '全部页面默认通过。输入任何反馈后，本页自动切换为需要修改。',
  allowUploads: kind === 'final',
});
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, html);
process.stdout.write(JSON.stringify({ valid: true, kind, pages: pages.length, source_sha256: sourceSha256, output: outputPath }) + '\n');
