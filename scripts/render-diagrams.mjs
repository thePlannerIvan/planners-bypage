#!/usr/bin/env node
/**
 * 把 diagram-manifest 里的 Mermaid 文字源渲染成 SVG 文件，并同步登记到 Asset Manifest。
 *
 * 这一步只产出**产物**，不改正文。正文里的 `![](diagrams/xxx.svg)` 由写稿的人加 ——
 * 这样图片通道、生产导出、PPT Hell 全都不需要改动。
 *
 * 用法：
 *   node scripts/render-diagrams.mjs --manifest <.bypage-work/diagram-manifest.json> \
 *        [--assets <.bypage-work/asset-manifest.json>] [--copy <by-page.md>] [--check] [--keep-visual-check]
 *
 *   --check              只渲染并与记录比对，不写盘（用于验证确定性 / 回归）
 *   --keep-visual-check  图变了也不作废上一次的视觉检查（默认会作废：改图等于没看过）
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { DIAGRAM_CONTRACT, DIAGRAM_TYPES, DIAGRAM_TYPES_NOTE, PELE_VERSION, loadPele, renderDiagram } from './lib/diagram-render.mjs';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const key = argv[i];
  if (!key?.startsWith('--')) continue;
  const next = argv[i + 1];
  if (next && !next.startsWith('--')) { args[key] = next; i += 1; } else { args[key] = true; }
}

// 写 source 之前先看词表：这一步就是为了「别只会画流程图」。
if (args['--types']) {
  const lines = DIAGRAM_TYPES.map(([job, syntax, use]) => `  ${job.padEnd(10, ' ')} ${syntax.padEnd(28, ' ')} ${use}`);
  process.stdout.write(`图型词表（pele@${PELE_VERSION}，Mermaid 12.1 语法）\n${lines.join('\n')}\n\n注意：${DIAGRAM_TYPES_NOTE}\n`);
  process.exit(0);
}
const check = args['--check'] === true;
const manifestPath = args['--manifest'] ? resolve(args['--manifest']) : null;
if (!manifestPath) {
  process.stdout.write(JSON.stringify({ valid: false, errors: [{ code: 'arg_error', message: '用法：render-diagrams.mjs --manifest <diagram-manifest.json> [--assets <asset-manifest.json>] [--copy <by-page.md>] [--check]' }] }) + '\n');
  process.exit(2);
}
if (!existsSync(manifestPath)) {
  process.stdout.write(JSON.stringify({ valid: false, errors: [{ code: 'file_error', message: '找不到图表清单：' + manifestPath }] }) + '\n');
  process.exit(2);
}

const sha256 = data => createHash('sha256').update(data).digest('hex');
const manifestDir = dirname(manifestPath);
const writeAtomic = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, content);
  renameSync(temp, file);
};
const errors = [];
const warnings = [];
const resetVisual = [];

let doc;
try { doc = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (error) {
  process.stdout.write(JSON.stringify({ valid: false, errors: [{ code: 'parse_error', message: error.message }] }) + '\n');
  process.exit(2);
}
if (doc.contract_version !== DIAGRAM_CONTRACT) errors.push({ code: 'contract_version', message: `contract_version 必须为 ${DIAGRAM_CONTRACT}` });
if (doc.renderer?.name !== 'pele') errors.push({ code: 'renderer_name', message: 'renderer.name 必须是 pele' });
if (doc.renderer?.version !== PELE_VERSION) {
  errors.push({ code: 'renderer_version', message: `renderer.version 必须钉在 ${PELE_VERSION}（实际 ${doc.renderer?.version ?? '缺失'}）` });
}
const diagrams = Array.isArray(doc.diagrams) ? doc.diagrams : [];
if (!diagrams.length) errors.push({ code: 'no_diagrams', message: 'diagrams 不能为空' });
if (errors.length) {
  process.stdout.write(JSON.stringify({ valid: false, errors }) + '\n');
  process.exit(1);
}

// 资产清单（可选）：渲染产物要作为资产进审阅与交付
const assetsPath = args['--assets'] ? resolve(args['--assets']) : null;
let assets = null;
let assetRootAbs = null;
if (assetsPath) {
  if (!existsSync(assetsPath)) errors.push({ code: 'asset_manifest_missing', message: '找不到资产清单：' + assetsPath });
  else {
    assets = JSON.parse(readFileSync(assetsPath, 'utf8'));
    if (!Array.isArray(assets.assets)) errors.push({ code: 'asset_manifest_shape', message: '资产清单的 assets 必须是数组' });
    assetRootAbs = resolve(dirname(assetsPath), assets.asset_root || '.');
  }
}

const theme = doc.theme || { preset: 'paper' };
const projectDir = args['--project-dir'] ? resolve(args['--project-dir']) : resolve(manifestDir, '..');
let pele;
try {
  pele = await loadPele({ projectDir, log: message => warnings.push({ code: 'install', message }) });
} catch (error) {
  process.stdout.write(JSON.stringify({ valid: false, errors: [{ code: 'renderer_unavailable', message: error.message }] }) + '\n');
  process.exit(1);
}

const receipt = [];
const dirty = [];
for (const [index, diagram] of diagrams.entries()) {
  const label = diagram.asset_id || `#${index}`;
  if (!diagram.source || !String(diagram.source).trim()) { errors.push({ code: 'source_empty', asset_id: label, message: '缺少 Mermaid 文字源' }); continue; }
  if (!diagram.output) { errors.push({ code: 'output_missing', asset_id: label, message: '缺少 output 路径' }); continue; }
  const outputAbs = resolve(manifestDir, diagram.output);
  // 允许把 ```mermaid 围栏整段粘进来
  const source = String(diagram.source).replace(/^\s*```[a-zA-Z]*\n/, '').replace(/\n```\s*$/, '');
  let result;
  try {
    result = renderDiagram(pele, { source, options: diagram.options || {}, theme });
  } catch (error) {
    errors.push({ code: 'render_failed', asset_id: label, message: String(error.message || error).split('\n')[0] });
    continue;
  }
  const hash = sha256(result.svg);
  const changed = !existsSync(outputAbs) || sha256(readFileSync(outputAbs)) !== hash;
  if (changed) dirty.push(outputAbs);
  if (!check && changed) writeAtomic(outputAbs, result.svg);
  let resetThis = false;
  if (!check) {
    // 图变了，「看过」就作废 —— 换方向、调画框、改字号都会让原来的目检结论失效。
    // 只有字节没变（重跑同样的源）才保留上一次的视觉检查。
    if (changed && diagram.visual_check?.status === 'passed' && !args['--keep-visual-check']) {
      resetThis = true;
      resetVisual.push(label);
      diagram.visual_check = { status: 'pending', method: '', notes: '' };
    }
    diagram.rendered_sha256 = hash;
    diagram.width = result.width;
    diagram.height = result.height;
    diagram.type = result.type;
  }

  // 资产清单同步：图的「源」就是文字源，事实出处在 source_id
  if (assets) {
    const relFromAssetRoot = relative(assetRootAbs, outputAbs).split(sep).join('/');
    const existing = assets.assets.find(item => item.asset_id === diagram.asset_id);
    if (!diagram.source_id && !existing?.source_id) {
      errors.push({ code: 'source_id_required', asset_id: label, message: '图会进资产清单，必须声明 source_id（图内事实来自哪条来源），否则等于开了核查后门' });
      continue;
    }
    const next = {
      asset_id: diagram.asset_id,
      path: relFromAssetRoot,
      preview_path: existing?.preview_path ?? null,
      processed_path: null,
      source_sha256: hash,
      processed_sha256: null,
      kind: 'diagram',
      semantic_class: existing?.semantic_class || diagram.semantic_class || 'narrative',
      source_id: diagram.source_id || existing?.source_id,
      source_context: existing?.source_context || `第 ${diagram.page_number ?? '?'} 页示意图：${diagram.intent || ''}`.trim(),
      status: existing?.status || 'selected',
      processing_level: 'none',
      processing_notes: `由 pele@${pele.version} 从 Mermaid 源确定性渲染；源见 diagram-manifest`,
      visual_check: resetThis ? { status: 'pending', method: '', notes: '' } : (existing?.visual_check || { status: 'pending', method: '', notes: '' }),
      width: result.width,
      height: result.height,
      issues: existing?.issues || [],
    };
    if (existing) Object.assign(existing, next);
    else assets.assets.push(next);
  }

  receipt.push({
    asset_id: diagram.asset_id, page_number: diagram.page_number ?? null, output: outputAbs,
    sha256: hash, width: result.width, height: result.height, type: result.type, changed,
    frame: result.frame, wrapped: result.wrapped,
  });
}

if (check) {
  for (const item of receipt) {
    if (item.changed) errors.push({ code: 'render_drift', asset_id: item.asset_id, message: '重新渲染的字节与记录不一致（源/主题/渲染器版本变了，或文件被手改过）' });
  }
} else {
  writeAtomic(manifestPath, `${JSON.stringify(doc, null, 2)}\n`);
  if (assets && assetsPath) writeAtomic(assetsPath, `${JSON.stringify(assets, null, 2)}\n`);
}

// 正文引用检查（可选）：每张有页码的图都必须在对应页里被引用
let copyReport = null;
if (args['--copy']) {
  const copyPath = resolve(args['--copy']);
  if (!existsSync(copyPath)) warnings.push({ code: 'copy_missing', message: '找不到正文：' + copyPath });
  else {
    const copyRaw = readFileSync(copyPath, 'utf8').replace(/\r\n/g, '\n');
    const pages = [...copyRaw.matchAll(/(?:^|\n)---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\ncontract_version:|$)/g)]
      .map(match => ({ page_number: Number(match[1].match(/^page_number:\s*(\d+)\s*$/m)?.[1]), body: match[2] }));
    const missing = [];
    for (const diagram of diagrams) {
      if (!diagram.page_number) continue;
      const page = pages.find(item => item.page_number === diagram.page_number);
      const expected = relative(dirname(copyPath), resolve(manifestDir, diagram.output)).split(sep).join('/');
      if (!page) { missing.push({ asset_id: diagram.asset_id, page_number: diagram.page_number, reason: '正文里没有这一页' }); continue; }
      if (!page.body.includes(expected)) missing.push({ asset_id: diagram.asset_id, page_number: diagram.page_number, reason: `第 ${diagram.page_number} 页没有引用 ${expected}` });
    }
    copyReport = { path: copyPath, missing };
    if (missing.length) warnings.push({ code: 'copy_reference', message: '有图没被正文引用：' + missing.map(item => item.asset_id).join('、') });
  }
}

const valid = errors.length === 0;
process.stdout.write(`${JSON.stringify({
  contract: DIAGRAM_CONTRACT,
  valid,
  check,
  renderer: { name: 'pele', version: pele.version, path: pele.path, action: pele.action },
  rendered: receipt,
  assets_synced: assets ? receipt.length : 0,
  copy: copyReport,
  visual_check_reset: resetVisual,
  warnings,
  errors,
})}\n`);
process.exit(valid ? 0 : 1);
