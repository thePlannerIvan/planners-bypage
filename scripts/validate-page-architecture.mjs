#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const input = argv.shift();
const assetFlag = argv.indexOf('--assets');
const assetPath = assetFlag >= 0 ? argv[assetFlag + 1] : null;
const finish = (valid, errors, code = valid ? 0 : 1) => {
  process.stdout.write(JSON.stringify({ contract: 'page-architecture/1.0.0', valid, records: valid ? 1 : 0, errors }) + '\n');
  process.exit(code);
};
if (!input) finish(false, [{ code: 'arg_error', message: '用法：validate-page-architecture.mjs <page-architecture.json> [--assets asset-manifest.json]' }], 2);
let doc;
try { doc = JSON.parse(readFileSync(resolve(input), 'utf8')); } catch (error) { finish(false, [{ code: 'file_error', message: error.message }], 2); }
const errors = [];
if (doc.contract_version !== 'page-architecture/1.0.0') errors.push({ code: 'contract_version', message: 'contract_version 无效' });
if (!/^pj_[a-f0-9]{24}$/.test(doc.project_id || '')) errors.push({ code: 'project_id', message: 'project_id 无效' });
if (!String(doc.storyline_thesis || '').trim()) errors.push({ code: 'storyline_thesis', message: 'storyline_thesis 不能为空' });
const sectionIds = new Set();
for (const [index, section] of (doc.sections || []).entries()) {
  if (!/^sec-[a-z0-9][a-z0-9-]{1,47}$/.test(section.section_id || '') || sectionIds.has(section.section_id)) errors.push({ code: 'section_id', index, message: 'section_id 无效或重复' });
  sectionIds.add(section.section_id);
  for (const field of ['title', 'audience_shift']) if (!String(section[field] || '').trim()) errors.push({ code: 'missing_field', index, field, message: field + ' 不能为空' });
}
if (!sectionIds.size) errors.push({ code: 'min_sections', message: '至少需要一个章节' });
let assetIds = null;
if (assetPath) {
  try { assetIds = new Set(JSON.parse(readFileSync(resolve(assetPath), 'utf8')).assets.map(item => item.asset_id)); } catch (error) { errors.push({ code: 'asset_manifest', message: error.message }); }
}
const pageTypes = new Set(['cover', 'contents', 'chapter', 'claim', 'explanation', 'data', 'case', 'process', 'diagram', 'quote', 'summary', 'action', 'appendix', 'freeform']);
for (const [index, page] of (doc.pages || []).entries()) {
  const number = index + 1;
  if (page.page_number !== number) errors.push({ code: 'page_number', page: number, message: '页码必须从 1 连续递增' });
  if (!sectionIds.has(page.section_id)) errors.push({ code: 'section_reference', page: number, message: '页面引用了不存在的章节' });
  if (!pageTypes.has(page.page_type)) errors.push({ code: 'page_type', page: number, message: 'page_type 无效' });
  for (const field of ['page_job', 'title_intent', 'main_message']) if (!String(page[field] || '').trim()) errors.push({ code: 'missing_field', page: number, field, message: field + ' 不能为空' });
  if (!Array.isArray(page.content_blocks) || !page.content_blocks.length) errors.push({ code: 'content_blocks', page: number, message: '每页至少需要一个内容块' });
  if (!Array.isArray(page.recommended_assets) || page.recommended_assets.length > 3) errors.push({ code: 'recommended_assets', page: number, message: 'recommended_assets 必须为 0–3 张' });
  for (const item of [...(page.recommended_assets || []), ...(page.other_candidate_assets || [])]) {
    if (assetIds && !assetIds.has(item.asset_id)) errors.push({ code: 'asset_reference', page: number, message: '未知 asset_id：' + item.asset_id });
    if (!String(item.role || '').trim() || !String(item.reason || '').trim()) errors.push({ code: 'asset_semantics', page: number, message: '候选图片必须说明 role 和 reason' });
  }
}
if (!Array.isArray(doc.pages) || !doc.pages.length) errors.push({ code: 'min_pages', message: '至少需要一页' });
finish(errors.length === 0, errors);
