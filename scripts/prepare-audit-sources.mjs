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
  return { text: output, method: 'pdftotext-layout' };
}

function officeText(source, extension) {
  if (['.docx', '.odt', '.rtf'].includes(extension)) {
    try {
      const text = run('pandoc', [source, '-t', 'plain']);
      if (text.trim()) return { text: `=== DOCUMENT ===\n${text.trimEnd()}\n`, method: 'pandoc-plain' };
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
    return { text: extracted.text, method: 'soffice-pdf+pdftotext-layout' };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const args = argsOf(process.argv.slice(2));
if (!args['--source-index']) throw new Error('用法：prepare-audit-sources.mjs --source-index <source-index.json> [--source-id src-id] [--force]');
const indexPath = resolve(args['--source-index']);
const indexDir = dirname(indexPath);
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const sourceRoot = resolve(indexDir, index.source_root || '.');
const outputDir = resolve(indexDir, 'audit-sources');
mkdirSync(outputDir, { recursive: true });
const supported = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.odt', '.rtf']);
const selectedId = args['--source-id'] || null;
let processed = 0;
let reused = 0;

for (const source of index.sources || []) {
  if (selectedId && source.source_id !== selectedId) continue;
  const fullPath = resolve(sourceRoot, source.file_path || '');
  if (!source.file_path || !existsSync(fullPath)) throw new Error(`来源文件不存在：${source.file_path || source.source_id}`);
  const sourceBytes = readFileSync(fullPath);
  const sourceHash = sha256(sourceBytes);
  source.sha256 = sourceHash;
  const extension = extname(fullPath).toLowerCase();
  if (!supported.has(extension) || source.read_mode === 'unread') continue;
  const previousPath = source.audit_companion?.file_path
    ? resolve(indexDir, source.audit_companion.file_path) : null;
  const reusable = !args['--force'] && previousPath && existsSync(previousPath)
    && source.audit_companion.source_sha256 === sourceHash
    && source.audit_companion.sha256 === sha256(readFileSync(previousPath));
  if (reusable) {
    reused += 1;
    continue;
  }
  const extracted = extension === '.pdf' ? pdfText(fullPath) : officeText(fullPath, extension);
  const outputPath = resolve(outputDir, `${source.source_id}.txt`);
  writeFileSync(outputPath, extracted.text);
  source.audit_companion = {
    file_path: relative(indexDir, outputPath).split('\\').join('/'),
    sha256: sha256(readFileSync(outputPath)),
    source_sha256: sourceHash,
    extraction_method: extracted.method,
  };
  processed += 1;
}

if (selectedId && !(index.sources || []).some(source => source.source_id === selectedId)) {
  throw new Error(`source-index 中不存在 ${selectedId}`);
}
index.contract_version = 'source-index/1.1.0';
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ valid: true, processed, reused, source_index: indexPath, audit_sources_dir: outputDir })}\n`);
