#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderPageReviewHtml } from './review/page-review-html.mjs';
import { pageDefaults, readPriorRound, seedAssetDecisions } from './lib/prior-round.mjs';
import {sha256,writeReviewContext} from './lib/review-edits.mjs';

const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 2) args[process.argv.slice(2)[i]] = process.argv.slice(2)[i + 1];
for (const key of ['--architecture', '--assets', '--output']) if (!args[key]) throw new Error('缺少 ' + key);
const architecturePath = resolve(args['--architecture']);
const manifestPath = resolve(args['--assets']);
const outputPath = resolve(args['--output']);
// 上一轮**人**做过的决定（页面决定 + 逐张图片状态）。读不到＝第一轮，行为与原来完全一致。
const priorRound = readPriorRound(args['--previous'] ? resolve(args['--previous']) : null, 'storyline');
const validation = spawnSync(process.execPath, [
  resolve(dirname(fileURLToPath(import.meta.url)), 'validate-page-architecture.mjs'),
  architecturePath, '--assets', manifestPath,
], { encoding: 'utf8' });
if (validation.status !== 0) throw new Error(validation.stdout || validation.stderr);
const architectureRaw = readFileSync(architecturePath, 'utf8');
const architecture = JSON.parse(architectureRaw);
const manifestRaw = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
const assetRoot = resolve(dirname(manifestPath), manifest.asset_root || '.');
const assetMap = new Map(manifest.assets.map(item => [item.asset_id, item]));
const reviewAssetDir = resolve(dirname(outputPath), 'assets');
mkdirSync(reviewAssetDir, { recursive: true });
function reviewAsset(use, group) {
  const asset = assetMap.get(use.asset_id);
  const source = resolve(assetRoot, asset.preview_path || asset.processed_path || asset.path);
  const destination = resolve(reviewAssetDir, asset.asset_id + (extname(source) || '.png'));
  copyFileSync(source, destination);
  return {
    asset_id: asset.asset_id,
    url: relative(dirname(outputPath), destination).split('\\').join('/'),
    alt: asset.asset_id,
    role: use.role,
    reason: use.reason + (asset.issues?.length ? ' · 注意：' + asset.issues.join('；') : ''),
    status: group === 'recommended' ? 'selected' : 'backup',
    group: group === 'recommended' ? 'recommended' : 'other',
  };
}
const sectionMap = new Map(architecture.sections.map(section => [section.section_id, section]));
const pages = architecture.pages.map(page => {
  const candidates = [
    ...page.recommended_assets.map(item => reviewAsset(item, 'recommended')),
    ...page.other_candidate_assets.map(item => reviewAsset(item, 'other')),
  ];
  return {
    page_number: page.page_number,
    section_id: page.section_id,
    title: page.title_intent,
    claim: page.main_message,
    blocks: page.content_blocks.map(block => ({title:block.block_title,text:block.content_requirement})),
    meta: [
      { label: '页面类型', value: page.page_type },
      { label: '页面任务', value: page.page_job },
      { label: '所属章节', value: sectionMap.get(page.section_id)?.title || page.section_id },
      { label: '后续取材', value: page.source_needs.length ? page.source_needs : ['无额外来源需求'] },
      { label: '进入下一页', value: page.transition || '本页为收束页' },
    ],
    sections: [],
    asset_candidates: candidates,
    // 上一轮人做过的决定 → 本轮要不要重新明确选择（以及只读上下文）。
    ...pageDefaults(priorRound?.byPage.get(page.page_number), false),
    // 逐张图片的初值：人选过就用人的，没选过才用生成器的候选分组。**生成器的分组不是人的决定。**
    seeded_asset_decisions: seedAssetDecisions(candidates, priorRound?.byPage.get(page.page_number)),
  };
});
const recheckPages = pages.filter(page => page.requires_recheck);
const sections = architecture.sections.map(s => ({section_id:s.section_id,title:s.title,lead:s.audience_shift,transition:s.transition}));
const sourceSha256 = sha256(architectureRaw+'\n---ASSET-MANIFEST---\n'+manifestRaw);
const context = writeReviewContext(dirname(outputPath),{type:'architecture',reviewKind:'storyline',sourceSha256,pages,sections,
  files:[{path:architecturePath,sha256:sha256(architectureRaw)},{path:manifestPath,sha256:sha256(manifestRaw)}]});
const html = renderPageReviewHtml({
  reviewKind: 'storyline',
  title: 'Storyline 与页面架构审阅',
  subtitle: architecture.storyline_thesis + ' · 共 ' + pages.length + ' 页。请一起判断章节推进、页面任务和图片候选。',
  sourceSha256, sections, thesis:architecture.storyline_thesis, draftPath:context.draftPath,
  pages,
  notice: recheckPages.length
    ? '所有页面默认通过；上一轮你标了「需要修改」的 ' + recheckPages.length + ' 页必须复核后明确选择（点一下通过即可）。每页先展示推荐的 1–3 张图片，其他候选折叠；改变图片状态或输入反馈后，本页自动切换为需要修改。'
    : '所有页面默认通过。每页先展示推荐的 1–3 张图片，其他候选折叠；改变图片状态或输入反馈后，本页自动切换为需要修改。',
  allowUploads: true,
});
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, html);
process.stdout.write(JSON.stringify({ valid: true, pages: pages.length, output: outputPath, recheck_pages: recheckPages.map(page => page.page_number) }) + '\n');
