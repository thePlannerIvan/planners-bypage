#!/usr/bin/env node
/**
 * 图表清单校验器：图能不能进终稿，靠这里说话。
 *
 * 它挡的不是格式，是**图和源对不上**：
 *   1. 产物文件的 Hash 必须等于记录的 Hash（文件被手改过就露馅）；
 *   2. 图里看得见的文字必须能在 Mermaid 源里找到（改字不改源就露馅）；
 *   3. 资产清单里的同一条必须指向同一个文件、同一个 Hash（登记与产物脱节就露馅）；
 *   4. 有页码的图必须在正文对应页被真正引用（画了没人用就露馅）；
 *   5. `--final` 时视觉检查必须真的做过（看过再交付）。
 *
 * 用法：
 *   node scripts/validate-diagrams.mjs --manifest <.bypage-work/diagram-manifest.json> \
 *        [--assets <.bypage-work/asset-manifest.json>] [--copy <by-page.md>] [--final] [--check-render]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { DIAGRAM_CONTRACT, PELE_VERSION, extractTexts, loadPele, renderDiagram } from './lib/diagram-render.mjs';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const key = argv[i];
  if (!key?.startsWith('--')) continue;
  const next = argv[i + 1];
  if (next && !next.startsWith('--')) { args[key] = next; i += 1; } else { args[key] = true; }
}
const finalMode = args['--final'] === true;
const checkRender = args['--check-render'] === true;
const finish = (valid, errors, extra = {}) => {
  process.stdout.write(JSON.stringify({ contract: DIAGRAM_CONTRACT, valid, final_mode: finalMode, check_render: checkRender, records: 0, ...extra, errors }) + '\n');
  process.exit(valid ? 0 : 1);
};
const manifestPath = args['--manifest'] ? resolve(args['--manifest']) : null;
if (!manifestPath) {
  process.stdout.write(JSON.stringify({ contract: DIAGRAM_CONTRACT, valid: false, errors: [{ code: 'arg_error', message: '用法：validate-diagrams.mjs --manifest <diagram-manifest.json> [--assets <asset-manifest.json>] [--copy <by-page.md>] [--final] [--check-render]' }] }) + '\n');
  process.exit(2);
}
if (!existsSync(manifestPath)) {
  process.stdout.write(JSON.stringify({ contract: DIAGRAM_CONTRACT, valid: false, errors: [{ code: 'file_error', message: '找不到图表清单：' + manifestPath }] }) + '\n');
  process.exit(2);
}

const sha256 = data => createHash('sha256').update(data).digest('hex');
const errors = [];
const warnings = [];
const manifestDir = dirname(manifestPath);

let doc;
try { doc = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (error) {
  process.stdout.write(JSON.stringify({ contract: DIAGRAM_CONTRACT, valid: false, errors: [{ code: 'parse_error', message: error.message }] }) + '\n');
  process.exit(2);
}

if (doc.contract_version !== DIAGRAM_CONTRACT) errors.push({ code: 'contract_version', message: `contract_version 必须为 ${DIAGRAM_CONTRACT}` });
if (doc.renderer?.name !== 'pele') errors.push({ code: 'renderer_name', message: 'renderer.name 必须是 pele' });
if (doc.renderer?.version !== PELE_VERSION) errors.push({ code: 'renderer_version', message: `renderer.version 必须钉在 ${PELE_VERSION}（实际 ${doc.renderer?.version ?? '缺失'}）` });
if (doc.theme && !['paper', 'ink'].includes(doc.theme.preset)) errors.push({ code: 'theme_preset', message: 'theme.preset 只能是 paper 或 ink' });
const diagrams = Array.isArray(doc.diagrams) ? doc.diagrams : null;
if (!diagrams) errors.push({ code: 'diagrams_type', message: 'diagrams 必须是数组' });

// 资产清单
let assets = null;
let assetRootAbs = null;
if (args['--assets']) {
  const assetsPath = resolve(args['--assets']);
  if (!existsSync(assetsPath)) errors.push({ code: 'asset_manifest_missing', message: '找不到资产清单：' + assetsPath });
  else {
    assets = JSON.parse(readFileSync(assetsPath, 'utf8'));
    assetRootAbs = resolve(dirname(assetsPath), assets.asset_root || '.');
  }
}

// 正文
let copyPages = null;
let copyDir = null;
if (args['--copy']) {
  const copyPath = resolve(args['--copy']);
  if (!existsSync(copyPath)) errors.push({ code: 'copy_missing', message: '找不到正文：' + copyPath });
  else {
    copyDir = dirname(copyPath);
    copyPages = [...readFileSync(copyPath, 'utf8').replace(/\r\n/g, '\n')
      .matchAll(/(?:^|\n)---\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n---\ncontract_version:|$)/g)]
      .map(match => ({ page_number: Number(match[1].match(/^page_number:\s*(\d+)\s*$/m)?.[1]), body: match[2] }));
  }
}

/* 文字漂移：把 SVG 里看得见的文字拆成「词」与「数字」。
 * 词必须能在 Mermaid 源里找到；数字允许派生（饼图的百分比、甘特的日期刻度是渲染算出来的），
 * 所以只按图型分级：会派生数字的图型把数字记成提示，其余图型数字对不上就是错误。 */
const DERIVES_NUMBERS = new Set(['pie', 'gantt', 'quadrantChart', 'xychart', 'sankey', 'radar', 'treemap', 'journey', 'timeline']);
function tokens(text) {
  const words = [];
  const digits = [];
  for (const raw of String(text).matchAll(/[0-9]+(?:[.,][0-9]+)?%?|[A-Za-z][A-Za-z0-9'’._-]*|[\u3400-\u9FFF]+/g)) {
    const token = raw[0];
    if (/^[0-9]/.test(token)) digits.push(token);
    else if (/^[A-Za-z]/.test(token)) { if (token.length >= 2) words.push(token.toLowerCase()); }
    else if ([...token].length >= 2) words.push(token);
  }
  return { words, digits };
}
const normalize = value => String(value).replace(/\s+/g, '').toLowerCase();

const ids = new Set();
const pending = [];
for (const [index, diagram] of (diagrams || []).entries()) {
  const label = diagram.asset_id || `#${index}`;
  if (!diagram.asset_id || !/^asset-[a-z0-9][a-z0-9-]{1,63}$/.test(diagram.asset_id)) errors.push({ code: 'asset_id', index, message: 'asset_id 无效' });
  else if (ids.has(diagram.asset_id)) errors.push({ code: 'asset_id_duplicate', index, message: 'asset_id 重复：' + diagram.asset_id });
  else ids.add(diagram.asset_id);
  if (!String(diagram.intent || '').trim()) errors.push({ code: 'intent_empty', asset_id: label, message: '缺少 intent（这张图要让人看懂什么）' });
  if (diagram.syntax !== 'mermaid') errors.push({ code: 'syntax', asset_id: label, message: 'syntax 目前只支持 mermaid' });
  if (!String(diagram.source || '').trim()) { errors.push({ code: 'source_empty', asset_id: label, message: '缺少 Mermaid 文字源 —— 图内文字将无法核查' }); continue; }
  const outputAbs = diagram.output ? resolve(manifestDir, diagram.output) : null;
  if (!outputAbs) { errors.push({ code: 'output_missing', asset_id: label, message: '缺少 output 路径' }); continue; }
  if (!existsSync(outputAbs)) { errors.push({ code: 'output_missing_file', asset_id: label, message: '产物不存在：' + outputAbs }); continue; }
  const fileHash = sha256(readFileSync(outputAbs));
  if (diagram.rendered_sha256 !== fileHash) errors.push({ code: 'render_hash_mismatch', asset_id: label, message: '产物 Hash 与记录不一致（文件被改过，或渲染后没更新清单）' });

  // 看得见的字 ⊆ 源
  const svg = readFileSync(outputAbs, 'utf8');
  const sourceNormalized = normalize(String(diagram.source).replace(/^\s*```[a-zA-Z]*\n/, '').replace(/\n```\s*$/, ''));
  const textTokens = extractTexts(svg).flatMap(text => Object.entries(tokens(text)).flatMap(([kind, list]) => list.map(token => ({ kind, token }))));
  const strictNumbers = !DERIVES_NUMBERS.has(diagram.type || '');
  for (const { kind, token } of textTokens) {
    if (sourceNormalized.includes(normalize(token))) continue;
    if (kind === 'digits' && !strictNumbers) { warnings.push({ code: 'derived_number', asset_id: label, message: `图里的数字 ${token} 是渲染派生的` }); continue; }
    errors.push({ code: 'text_drift', asset_id: label, message: `图里有字不在源里：「${token}」——图被改过，或源没同步` });
  }

  // 视觉检查
  const visual = diagram.visual_check || {};
  if (!['pending', 'passed', 'failed'].includes(visual.status)) errors.push({ code: 'visual_check_status', asset_id: label, message: 'visual_check.status 无效' });
  if (finalMode && visual.status !== 'passed') errors.push({ code: 'visual_check_required', asset_id: label, message: '进终稿前必须真的看过这张图（visual_check.status=passed）' });
  if (visual.status === 'passed' && (!String(visual.method || '').trim() || !String(visual.notes || '').trim())) errors.push({ code: 'visual_check_evidence', asset_id: label, message: '视觉检查通过时必须记录 method 与 notes' });

  // 资产清单对齐
  if (assets) {
    const asset = (assets.assets || []).find(item => item.asset_id === diagram.asset_id);
    if (!asset) errors.push({ code: 'asset_missing', asset_id: label, message: '资产清单里没有这条图（先跑 render-diagrams.mjs 同步）' });
    else {
      const assetPathAbs = resolve(assetRootAbs, asset.path || '');
      if (assetPathAbs !== outputAbs) errors.push({ code: 'asset_path_mismatch', asset_id: label, message: `资产清单指向 ${asset.path}，与图的 output 不是同一个文件` });
      if (asset.source_sha256 !== diagram.rendered_sha256) errors.push({ code: 'asset_hash_mismatch', asset_id: label, message: '资产清单的 Hash 与图的 Hash 不一致' });
      if (asset.kind !== 'diagram') errors.push({ code: 'asset_kind', asset_id: label, message: '资产清单 kind 应为 diagram' });
      if (!String(asset.source_id || '').trim()) errors.push({ code: 'asset_source_id', asset_id: label, message: '图必须登记 source_id，否则图内事实不可核查' });
      // 进终审的图必须是定稿状态：正文引用了、却没被采用，交付包里就会缺这一条
      if (finalMode && !['selected', 'backup'].includes(asset.status)) {
        errors.push({ code: 'asset_status_final', asset_id: label, message: `正文引用了这张图，但资产状态是 ${asset.status}；终审前必须定为 selected（候选态会被交付流程跳过）` });
      }
    }
  }

  // 正文引用
  if (copyPages && diagram.page_number) {
    const page = copyPages.find(item => item.page_number === diagram.page_number);
    const expected = relative(copyDir, outputAbs).split(sep).join('/');
    if (!page) errors.push({ code: 'copy_page_missing', asset_id: label, message: `正文里没有第 ${diagram.page_number} 页` });
    else if (!page.body.includes(expected)) errors.push({ code: 'copy_reference_missing', asset_id: label, message: `第 ${diagram.page_number} 页没有引用 ${expected}` });
  }
  if (checkRender) pending.push({ diagram, label, expectedHash: diagram.rendered_sha256 });
}

// 重新渲染比对（最强的一条：证明产物真的来自这份源）
if (checkRender && pending.length) {
  let pele;
  try {
    pele = await loadPele({ projectDir: resolve(manifestDir, '..'), log: () => {} });
  } catch (error) {
    errors.push({ code: 'renderer_unavailable', message: error.message });
  }
  if (pele) {
    for (const { diagram, label, expectedHash } of pending) {
      try {
        const result = renderDiagram(pele, {
          source: String(diagram.source).replace(/^\s*```[a-zA-Z]*\n/, '').replace(/\n```\s*$/, ''),
          options: diagram.options || {},
          theme: doc.theme || {},
        });
        if (sha256(result.svg) !== expectedHash) errors.push({ code: 'render_drift', asset_id: label, message: '用这份源重新渲染，字节与记录不一致（源、主题或渲染器版本变过）' });
      } catch (error) {
        errors.push({ code: 'render_failed', asset_id: label, message: String(error.message || error).split('\n')[0] });
      }
    }
  }
}

const unique = [...new Map(errors.map(item => [JSON.stringify(item), item])).values()];
const receipt = {
  contract: DIAGRAM_CONTRACT,
  valid: unique.length === 0,
  final_mode: finalMode,
  check_render: checkRender,
  records: (diagrams || []).length,
  warnings,
  errors: unique,
};
process.stdout.write(`${JSON.stringify(receipt)}\n`);
process.exit(receipt.valid ? 0 : 1);
