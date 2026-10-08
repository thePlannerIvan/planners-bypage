#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename, dirname, extname, join, relative, resolve,
} from 'node:path';
import { spawnSync } from 'node:child_process';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1];
    if (value && !value.startsWith('--')) {
      out[key] = value;
      index += 1;
    } else out[key] = true;
  }
  return out;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') throw new Error(`缺少转换工具：${command}`);
  if (result.status !== 0) throw new Error(`${command} 转换失败：${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

function withPageMarkers(text) {
  const pages = String(text).replace(/\r\n/g, '\n').split('\f');
  while (pages.length && !pages[pages.length - 1].trim()) pages.pop();
  return `${pages.map((page, index) => `=== PAGE ${index + 1} ===\n${page.trimEnd()}`).join('\n\n')}\n`;
}

function pdfText(source) {
  const output = withPageMarkers(run('pdftotext', ['-layout', source, '-']));
  if (!output.replace(/=== PAGE \d+ ===/g, '').trim()) {
    throw new Error(`PDF 没有可用文本层：${source}；请先 OCR，并把 OCR 文本登记为 audit_companion`);
  }
  return { text: output, method: 'pdftotext-layout', anchorMarks: '=== PAGE n ===' };
}

function officeText(source, extension) {
  if (['.docx', '.odt', '.rtf'].includes(extension)) {
    try {
      const text = run('pandoc', [source, '-t', 'plain']);
      if (text.trim()) return { text: `=== DOCUMENT ===\n${text.trimEnd()}\n`, method: 'pandoc-plain', anchorMarks: '=== DOCUMENT ===' };
    } catch (error) {
      if (!String(error.message).includes('缺少转换工具')) throw error;
    }
  }
  const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-audit-'));
  try {
    run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', temp, source]);
    const pdf = readdirSync(temp).find(file => extname(file).toLowerCase() === '.pdf');
    if (!pdf) throw new Error(`LibreOffice 未生成 PDF：${basename(source)}`);
    const extracted = pdfText(join(temp, pdf));
    return { text: extracted.text, method: 'soffice-pdf+pdftotext-layout', anchorMarks: extracted.anchorMarks };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const args = argsOf(process.argv.slice(2));
if (!args['--source-index']) throw new Error('用法：prepare-audit-sources.mjs --source-index <source-index.json> [--source-id src-id] [--force]');
const indexPath = resolve(args['--source-index']);
const indexDir = dirname(indexPath);
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const originalIndex = JSON.stringify(index);
const sourceRoot = resolve(indexDir, index.source_root || '.');
const outputDir = resolve(indexDir, 'audit-sources');
mkdirSync(outputDir, { recursive: true });
const supported = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.odt', '.rtf']);
const selectedId = args['--source-id'] || null;
let processed = 0;
let reused = 0;

for (const source of index.sources || []) {
  if (selectedId && source.source_id !== selectedId) continue;
  const originPath = source.origin?.path || '';
  const fullPath = resolve(sourceRoot, originPath);
  if (!originPath || !existsSync(fullPath)) throw new Error(`来源文件不存在：${originPath || source.source_id}`);
  const sourceBytes = readFileSync(fullPath);
  const sourceHash = sha256(sourceBytes);
  source.origin.sha256 = sourceHash;
  source.origin.bytes = sourceBytes.length;
  const extension = extname(fullPath).toLowerCase();
  // 2.0.0：读没读到由 coverage.status 表达，不再有 read_mode
  if (!supported.has(extension) || source.coverage?.status === 'unread') continue;
  const previousPath = source.audit_layer?.path ? resolve(indexDir, source.audit_layer.path) : null;
  const reusable = !args['--force'] && previousPath && existsSync(previousPath)
    && source.audit_layer.derived_from_sha256 === sourceHash
    && source.audit_layer.sha256 === sha256(readFileSync(previousPath));
  if (reusable) {
    reused += 1;
    continue;
  }
  const extracted = extension === '.pdf' ? pdfText(fullPath) : officeText(fullPath, extension);
  const outputPath = resolve(outputDir, `${source.source_id}.txt`);
  writeFileSync(outputPath, extracted.text);
  source.audit_layer = {
    mode: 'audit_companion',
    path: relative(indexDir, outputPath).split('\\').join('/'),
    sha256: sha256(readFileSync(outputPath)),
    derived_from_sha256: sourceHash,   // 审计副本就是这份文件的文本渲染，必须绑它的哈希
    snapshot_sha256: null,
    method: extracted.method,
    anchor_marks: extracted.anchorMarks || null,
  };
  processed += 1;
}

if (selectedId && !(index.sources || []).some(source => source.source_id === selectedId)) {
  throw new Error(`source-index 中不存在 ${selectedId}`);
}
index.contract_version = 'source-index/2.0.0';
const changed = JSON.stringify(index) !== originalIndex;
if (changed) {
  delete index.index_sha256;
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}
// 提示：这些来源的覆盖状态不是 full，按契约必须在 blind_spots 里各自有一条（语义由模型写，脚本只点名）
const needsBlindSpots = (index.sources || [])
  .filter(source => source.coverage && source.coverage.status !== 'full')
  .map(source => source.source_id);
process.stdout.write(`${JSON.stringify({ valid: true, processed, reused, changed, needs_blind_spots: needsBlindSpots, source_index: indexPath, audit_sources_dir: outputDir })}\n`);
