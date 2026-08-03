#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 2) args[process.argv.slice(2)[i]] = process.argv.slice(2)[i + 1];
const finish = (valid, errors, code = valid ? 0 : 1) => {
  process.stdout.write(JSON.stringify({ contract: 'page-material-packs/1.0.0', valid, records: valid ? 1 : 0, errors }) + '\n');
  process.exit(code);
};
for (const key of ['--materials', '--architecture', '--sources', '--assets']) if (!args[key]) finish(false, [{ code: 'arg_error', message: '缺少 ' + key }], 2);
let doc, architecture, sources, assets, architectureRaw;
try {
  doc = JSON.parse(readFileSync(resolve(args['--materials']), 'utf8'));
  architectureRaw = readFileSync(resolve(args['--architecture']), 'utf8');
  architecture = JSON.parse(architectureRaw);
  sources = new Set(JSON.parse(readFileSync(resolve(args['--sources']), 'utf8')).sources.map(item => item.source_id));
  assets = new Set(JSON.parse(readFileSync(resolve(args['--assets']), 'utf8')).assets.map(item => item.asset_id));
} catch (error) { finish(false, [{ code: 'file_error', message: error.message }], 2); }
const errors = [];
if (doc.contract_version !== 'page-material-packs/1.0.0') errors.push({ code: 'contract_version', message: 'contract_version 无效' });
const hash = createHash('sha256').update(architectureRaw).digest('hex');
if (doc.architecture_sha256 !== hash) errors.push({ code: 'architecture_hash', message: '材料包没有绑定当前页面架构' });
if ((doc.packs || []).length !== architecture.pages.length) errors.push({ code: 'page_coverage', message: '材料包必须覆盖全部页面' });
for (const [index, pack] of (doc.packs || []).entries()) {
  const page = index + 1;
  if (pack.page_number !== page) errors.push({ code: 'page_number', page, message: '材料包页码必须连续' });
  for (const item of (pack.materials || [])) if (!sources.has(item.source_id)) errors.push({ code: 'source_reference', page, message: '未知 source_id：' + item.source_id });
  for (const assetId of (pack.asset_ids || [])) if (!assets.has(assetId)) errors.push({ code: 'asset_reference', page, message: '未知 asset_id：' + assetId });
}
finish(errors.length === 0, errors);
