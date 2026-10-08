#!/usr/bin/env node
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  basename, dirname, join, relative, resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {pageNumber, scalar, section, splitPages} from './lib/bypage-copy.mjs';
import {writeProductionExport} from './lib/production-export.mjs';
import { createHash } from 'node:crypto';
import {moduleScript} from './lib/planners-modules.mjs';
import {pathToFileURL} from 'node:url';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) out[argv[index]] = argv[index + 1];
  return out;
}
function safeName(value) {
  return basename(value).replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'image';
}
function copyAsset(source, assetsDir, pageNumber, outputPath) {
  if (!existsSync(source)) return null;
  if (realpathSync(source).split(/[\\/]/).some(part => part.startsWith('.env'))) {
    throw new Error('Environment files cannot be copied into a production package');
  }
  const pageDir = resolve(assetsDir, `page-${String(pageNumber).padStart(2, '0')}`);
  mkdirSync(pageDir, { recursive: true });
  let destination = resolve(pageDir, safeName(source));
  for (let index = 2; existsSync(destination); index++) {
    const name = safeName(source);
    const dot = name.lastIndexOf('.');
    destination = resolve(pageDir, dot > 0 ? `${name.slice(0, dot)}-${index}${name.slice(dot)}` : `${name}-${index}`);
  }
  copyFileSync(source, destination);
  return relative(dirname(outputPath), destination).split('\\').join('/');
}
function localizeImages(markdown, copyPath, assetsDir, pageNumber, outputPath) {
  return String(markdown).replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (whole, alt, rawTarget) => {
    const target = rawTarget.trim().replace(/^<|>$/g, '');
    if (/^https?:\/\//i.test(target)) return whole;
    const localized = copyAsset(resolve(dirname(copyPath), target), assetsDir, pageNumber, outputPath);
    return localized ? `![${alt}](${localized})` : whole;
  });
}
function assetSection(attachments, feedbackPath, assetsDir, pageNumber, outputPath) {
  if (!attachments.length) return '';
  const lines = ['## Page Assets', ''];
  for (const asset of attachments) {
    const source = asset.url ? resolve(dirname(feedbackPath), asset.url) : null;
    const path = source ? copyAsset(source, assetsDir, pageNumber, outputPath) : null;
    if (!path) continue;
    lines.push(`![${asset.alt || '页面图片'}](${path})`);
    if ((asset.caption || '').trim()) lines.push('', `*${asset.caption.trim()}*`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
function rewriteRegisteredAssetPaths(markdown, pathMap) {
  let output = String(markdown);
  for (const [source, delivered] of [...pathMap.entries()].sort((left, right) => right[0].length - left[0].length)) {
    output = output.split(source).join(delivered);
  }
  return output;
}

const args = argsOf(process.argv.slice(2));
for (const key of ['--copy', '--audit', '--manifest', '--output', '--assets-dir']) {
  if (!args[key]) throw new Error(`缺少 ${key}`);
}
if (!args['--feedback'] && !args['--workbench']) throw Error('需要 --workbench <审阅目录> 或旧版 --feedback');
if (args['--feedback'] && args['--workbench']) throw Error('选择一种内容版本绑定方式');
for (const path of Object.values(args)) {
  const canonical = existsSync(path) ? realpathSync(path) : String(path);
  if (canonical.split(/[\\/]/).some(part => part.startsWith('.env'))) {
    throw new Error('Environment files are not production inputs or outputs');
  }
}
const copyPath = resolve(args['--copy']);
const auditPath = resolve(args['--audit']);
const feedbackPath = args['--feedback'] ? resolve(args['--feedback']) : null;
const manifestPath = resolve(args['--manifest']);
const outputPath = resolve(args['--output']);
const assetsDir = resolve(args['--assets-dir']);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const contextPath = resolve(args['--workbench'] || dirname(feedbackPath), 'review-context.json');
if (!args['--workbench'] && existsSync(contextPath)) {
  const context = JSON.parse(readFileSync(contextPath, 'utf8'));
  const reviewedManifest = (context.files || []).find(file => resolve(file.path) === manifestPath);
  if (!reviewedManifest || reviewedManifest.sha256 !== createHash('sha256').update(readFileSync(manifestPath)).digest('hex')) {
    throw new Error('资产清单已变化或不属于本轮审阅，需检查内容并重新审阅');
  }
}
const identity = path => existsSync(path) ? realpathSync(path) : path;
const protectedPaths = [copyPath, auditPath, feedbackPath, manifestPath,
  resolve(dirname(auditPath), audit.source_index?.path || '.')].filter(Boolean).map(identity);
if (protectedPaths.includes(identity(outputPath))
  || protectedPaths.includes(identity(resolve(assetsDir, 'asset-manifest.json')))) {
  throw new Error('交付输出不能覆盖活动稿、核查、反馈、资产清单或来源索引');
}
const copyValidation = spawnSync(process.execPath, [resolve(scriptDir, 'validate-bypage.mjs'), copyPath], { encoding: 'utf8' });
if (copyValidation.status !== 0) throw new Error(`正式稿格式无效：${copyValidation.stdout || copyValidation.stderr}`);
if ((audit.suspects || []).some(item => ['confirmed', 'no_source'].includes(item.verdict))) {
  throw new Error('事实仍有待改或无来源项，先修正、补证或由用户逐项裁定边界后续检');
}
const auditValidation = spawnSync(process.execPath, [
  resolve(scriptDir, 'validate-fact-audit.mjs'),
  '--audit', auditPath, '--copy', copyPath, '--allow-human-review', 'true',
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (auditValidation.status !== 0) {
  throw new Error(`事实语义核验无效，不能生成交付物：${auditValidation.stdout || auditValidation.stderr}`);
}
let workbenchPath;
if (args['--workbench']) {
  const report = JSON.parse(auditValidation.stdout);
  if (report.human_review_required?.length) throw Error('事实例外仍需逐项裁定，保存内容不能代替事实决定');
  const {writeContentSnapshot} = await import(pathToFileURL(moduleScript('planners-review-core','scripts/content-snapshot.mjs')));
  workbenchPath = writeContentSnapshot(args['--workbench'],copyPath,{audit:auditPath,asset_manifest:manifestPath});
} else {
const feedbackValidation = spawnSync(process.execPath, [
  resolve(scriptDir, 'validate-review-feedback.mjs'),
  '--feedback', feedbackPath, '--copy', copyPath, '--audit', auditPath, '--kind', 'final',
  ...(args['--production-json'] ? ['--manifest', manifestPath] : []),
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (feedbackValidation.status !== 0) {
  throw new Error(`终稿反馈无效，不能生成交付物：${feedbackValidation.stdout || feedbackValidation.stderr}`);
}
}
const pages = splitPages(readFileSync(copyPath, 'utf8'));
const feedback = feedbackPath ? JSON.parse(readFileSync(feedbackPath, 'utf8')) : {decisions:[]};
if (feedbackPath && feedback.overall_decision !== 'approve') throw new Error('终稿仍有修改项，不能生成交付物');
const manifestValidation = spawnSync(process.execPath, [
  resolve(scriptDir, 'validate-asset-manifest.mjs'), manifestPath, '--final',
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (manifestValidation.status !== 0) throw new Error(`资产清单无效，不能生成交付物：${manifestValidation.stdout || manifestValidation.stderr}`);
const decisions = new Map((feedback.decisions || []).map(item => [item.page_number, item]));
if (pages.length === 0) throw new Error('Copy 中没有可解析页面');
mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(assetsDir, { recursive: true });
const sourceManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sourceAssetRoot = resolve(dirname(manifestPath), sourceManifest.asset_root || '.');
const deliveredAssets = [];
const deliveredPathMap = new Map();
for (const asset of sourceManifest.assets || []) {
  if (!['selected', 'backup'].includes(asset.status)) continue;
  const outputAsset = { ...asset };
  for (const [field, folder] of [['path', 'original'], ['processed_path', 'processed']]) {
    if (!asset[field]) continue;
    const source = resolve(sourceAssetRoot, asset[field]);
    if (!existsSync(source)) throw new Error(`交付资产不存在：${asset[field]}`);
    if (realpathSync(source).split(/[\\/]/).some(part => part.startsWith('.env'))) {
      throw new Error('Environment files cannot be copied into a production package');
    }
    const destinationDir = resolve(assetsDir, folder);
    mkdirSync(destinationDir, { recursive: true });
    const destination = resolve(destinationDir, `${asset.asset_id}-${safeName(source)}`);
    if (!existsSync(destination)) copyFileSync(source, destination);
    const delivered = relative(dirname(outputPath), destination).split('\\').join('/');
    outputAsset[field] = relative(assetsDir, destination).split('\\').join('/');
    deliveredPathMap.set(String(asset[field]).split('\\').join('/'), delivered);
    deliveredPathMap.set(relative(dirname(copyPath), source).split('\\').join('/'), delivered);
  }
  if (asset.preview_path) outputAsset.preview_path = null;
  deliveredAssets.push(outputAsset);
}
const pagesWithAssets = new Set();
const outputPages = pages.map(page => {
  const number = pageNumber(page);
  const attachments = decisions.get(number)?.attachments || [];
  const title = scalar(page, 'page_title') || `第 ${number} 页`;
  const claim = scalar(page, 'main_message');
  const visibleCopy = localizeImages(
    section(page, 'Page Content', 'Speaker Notes'),
    copyPath,
    assetsDir,
    number,
    outputPath,
  );
  const assetMarkdown = assetSection(attachments, feedbackPath, assetsDir, number, outputPath);
  const productionNotes = rewriteRegisteredAssetPaths(
    section(page, 'Production Notes', 'Sources'),
    deliveredPathMap,
  );
  if (/!\[[^\]]*\]\([^)]+\)/.test(visibleCopy) || assetMarkdown) pagesWithAssets.add(number);
  return [
    `## P${String(number).padStart(2, '0')}｜${title}`,
    '',
    claim ? `> ${claim}` : '',
    '',
    visibleCopy,
    assetMarkdown ? `\n${assetMarkdown}` : '',
    '',
    '## Speaker Notes',
    '',
    section(page, 'Speaker Notes', 'Production Notes'),
    '',
    '## Production Notes',
    '',
    productionNotes,
    '',
    '## Sources',
    '',
    section(page, 'Sources'),
  ].filter((line, index, values) => line !== '' || values[index - 1] !== '').join('\n').trim();
});
const finalMarkdown = `# PPT By-page 内容稿\n\n${outputPages.join('\n\n---\n\n')}\n`;
writeFileSync(outputPath, finalMarkdown);
for (const match of finalMarkdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
  const target = match[1].trim().replace(/^<|>$/g, '');
  if (!/^https?:\/\//i.test(target) && !existsSync(resolve(dirname(outputPath), target))) {
    throw new Error(`交付文档引用了不存在的图片：${target}`);
  }
}
const deliveredManifestPath = resolve(assetsDir, 'asset-manifest.json');
writeFileSync(deliveredManifestPath, `${JSON.stringify({
  contract_version: 'asset-manifest/1.1.0',
  asset_root: '.',
  assets: deliveredAssets,
}, null, 2)}\n`);
const deliveredManifestValidation = spawnSync(process.execPath, [
  resolve(scriptDir, 'validate-asset-manifest.mjs'), deliveredManifestPath, '--final',
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (deliveredManifestValidation.status !== 0) {
  throw new Error(`交付 Asset Manifest 无效：${deliveredManifestValidation.stdout || deliveredManifestValidation.stderr}`);
}
if (args['--production-json']) {
  writeProductionExport({
    output: args['--production-json'], memory: args['--memory'],
    architecture: args['--architecture'], materials: args['--materials'],
    copyPath, auditPath, feedbackPath, workbenchPath, manifestPath, outputPath,
    deliveredManifestPath, pages, outputPages,
  });
}
process.stdout.write(`${JSON.stringify({
  valid: true,
  pages: outputPages.length,
  pages_with_assets: pagesWithAssets.size,
  manifest_assets: deliveredAssets.length,
  output: outputPath,
})}\n`);
