#!/usr/bin/env node
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  basename, dirname, join, relative, resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {copyScalar} from './lib/copy-scalars.mjs';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) out[argv[index]] = argv[index + 1];
  return out;
}
function splitPages(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  return [...normalized.matchAll(/(?:^|\n)(---\n[\s\S]*?\n---\n[\s\S]*?)(?=\n---\ncontract_version:|$)/g)]
    .map(match => match[1].trimEnd());
}
function pageNumber(page) {
  return Number(page.match(/^page_number:\s*(\d+)\s*$/m)?.[1]);
}
function scalar(page, key) {
  return copyScalar(page.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]);
}
function section(page, name, nextName = null) {
  const end = nextName ? `(?=\\n##\\s*${nextName})` : '$';
  return page.match(new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)${end}`, 'i'))?.[1]?.trim() || '';
}
function safeName(value) {
  return basename(value).replace(/[^\p{L}\p{N}._-]+/gu, '-') || 'image';
}
function copyAsset(source, assetsDir, pageNumber, outputPath) {
  if (!existsSync(source)) return null;
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
for (const key of ['--copy', '--audit', '--feedback', '--manifest', '--output', '--assets-dir']) {
  if (!args[key]) throw new Error(`缺少 ${key}`);
}
const copyPath = resolve(args['--copy']);
const auditPath = resolve(args['--audit']);
const feedbackPath = resolve(args['--feedback']);
const manifestPath = resolve(args['--manifest']);
const outputPath = resolve(args['--output']);
const assetsDir = resolve(args['--assets-dir']);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const auditValidation = spawnSync(process.execPath, [
  resolve(scriptDir, 'validate-fact-audit.mjs'),
  '--audit', auditPath, '--copy', copyPath, '--allow-human-review', 'true',
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (auditValidation.status !== 0) {
  throw new Error(`事实语义核验无效，不能生成交付物：${auditValidation.stdout || auditValidation.stderr}`);
}
const feedbackValidation = spawnSync(process.execPath, [
  resolve(scriptDir, 'validate-review-feedback.mjs'),
  '--feedback', feedbackPath, '--copy', copyPath, '--audit', auditPath, '--kind', 'final',
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (feedbackValidation.status !== 0) {
  throw new Error(`终稿反馈无效，不能生成交付物：${feedbackValidation.stdout || feedbackValidation.stderr}`);
}
const pages = splitPages(readFileSync(copyPath, 'utf8'));
const feedback = JSON.parse(readFileSync(feedbackPath, 'utf8'));
if (feedback.overall_decision !== 'approve') throw new Error('终稿仍有修改项，不能生成交付物');
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
process.stdout.write(`${JSON.stringify({
  valid: true,
  pages: outputPages.length,
  pages_with_assets: pagesWithAssets.size,
  manifest_assets: deliveredAssets.length,
  output: outputPath,
})}\n`);
