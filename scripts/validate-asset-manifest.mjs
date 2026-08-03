#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [input, ...rest] = process.argv.slice(2);
const finalMode = rest.includes('--final');
const finish = (valid, errors, code = valid ? 0 : 1) => {
  process.stdout.write(JSON.stringify({ contract: 'asset-manifest/1.1.0', valid, final_mode: finalMode, records: valid ? 1 : 0, errors }) + '\n');
  process.exit(code);
};
if (!input || rest.some(value => value !== '--final')) finish(false, [{ code: 'arg_error', message: '用法：validate-asset-manifest.mjs <asset-manifest.json> [--final]' }], 2);
let doc;
try { doc = JSON.parse(readFileSync(resolve(input), 'utf8')); } catch (error) { finish(false, [{ code: 'file_error', message: error.message }], 2); }
const errors = [];
if (doc.contract_version !== 'asset-manifest/1.1.0') errors.push({ code: 'contract_version', message: 'contract_version 必须为 asset-manifest/1.1.0' });
if (!Array.isArray(doc.assets)) errors.push({ code: 'assets_type', message: 'assets 必须是数组' });
const root = resolve(dirname(resolve(input)), doc.asset_root || '.');
const ids = new Set();
for (const [index, asset] of (doc.assets || []).entries()) {
  if (!/^asset-[a-z0-9][a-z0-9-]{1,63}$/.test(asset.asset_id || '') || ids.has(asset.asset_id)) errors.push({ code: 'asset_id', index, message: 'asset_id 无效或重复' });
  ids.add(asset.asset_id);
  if (!['content_evidence', 'narrative', 'brand_asset', 'reference', 'decorative_noise', 'uncertain'].includes(asset.semantic_class)) errors.push({ code: 'semantic_class', index, message: 'semantic_class 无效' });
  if (!['unreviewed', 'recommended', 'selected', 'backup', 'excluded', 'replace'].includes(asset.status)) errors.push({ code: 'status', index, message: 'status 无效' });
  if (!['none', 'conservative', 'enhanced'].includes(asset.processing_level)) errors.push({ code: 'processing_level', index, message: 'processing_level 无效' });
  const file = resolve(root, asset.path || '');
  if (!asset.path || !existsSync(file)) errors.push({ code: 'missing_file', index, message: '资产文件不存在：' + (asset.path || '') });
  else {
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (asset.source_sha256 !== hash) errors.push({ code: 'source_hash_mismatch', index, message: 'source_sha256 与 path 指向文件不一致' });
  }
  if (asset.processed_path && !existsSync(resolve(root, asset.processed_path))) errors.push({ code: 'missing_processed_file', index, message: '处理图不存在：' + asset.processed_path });
  else if (asset.processed_path) {
    const processedHash = createHash('sha256').update(readFileSync(resolve(root, asset.processed_path))).digest('hex');
    if (asset.processed_sha256 !== processedHash) errors.push({ code: 'processed_hash_mismatch', index, message: 'processed_sha256 与 processed_path 指向文件不一致' });
  }
  if (!asset.processed_path && asset.processed_sha256 !== null) errors.push({ code: 'unexpected_processed_hash', index, message: '没有 processed_path 时 processed_sha256 必须为 null' });
  if (asset.processing_level !== 'none' && !asset.processed_path) errors.push({ code: 'processed_path', index, message: '已处理资产必须提供 processed_path' });
  const visual = asset.visual_check || {};
  if (!['pending', 'passed', 'failed', 'not_required'].includes(visual.status)) errors.push({ code: 'visual_check_status', index, message: 'visual_check.status 无效' });
  if (finalMode && ['selected', 'backup'].includes(asset.status) && visual.status !== 'passed') errors.push({ code: 'visual_check_required', index, message: '采用或备用图片进入终审前必须完成内容视觉检查' });
  if (visual.status === 'passed' && (!String(visual.method || '').trim() || !String(visual.notes || '').trim())) errors.push({ code: 'visual_check_evidence', index, message: '视觉检查通过时必须记录 method 与 notes' });
}
finish(errors.length === 0, errors);
