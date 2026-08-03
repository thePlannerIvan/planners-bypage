#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const [input, ...rest] = process.argv.slice(2);
const finish = (valid, errors, code = valid ? 0 : 1) => {
  process.stdout.write(JSON.stringify({ contract: 'source-index/1.1.0', valid, records: valid ? 1 : 0, errors }) + '\n');
  process.exit(code);
};
if (!input || rest.length) finish(false, [{ code: 'arg_error', message: '用法：validate-source-index.mjs <source-index.json>' }], 2);
let doc;
try { doc = JSON.parse(readFileSync(resolve(input), 'utf8')); } catch (error) { finish(false, [{ code: 'file_error', message: error.message }], 2); }
const errors = [];
const idPattern = /^src-[a-z0-9][a-z0-9-]{1,63}$/;
if (doc.contract_version !== 'source-index/1.1.0') errors.push({ code: 'contract_version', message: 'contract_version 必须为 source-index/1.1.0' });
if (!Array.isArray(doc.sources) || !doc.sources.length) errors.push({ code: 'min_sources', message: '至少需要一个来源' });
const ids = new Set();
const indexDir = dirname(resolve(input));
const root = resolve(indexDir, doc.source_root || '.');
const binaryTextExtensions = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx']);
const hashOf = path => createHash('sha256').update(readFileSync(path)).digest('hex');
for (const [index, source] of (doc.sources || []).entries()) {
  if (!idPattern.test(source.source_id || '') || ids.has(source.source_id)) errors.push({ code: 'source_id', index, message: 'source_id 无效或重复' });
  ids.add(source.source_id);
  if (!['full', 'sampled', 'duplicate_or_derived', 'unread'].includes(source.read_mode)) errors.push({ code: 'read_mode', index, message: 'read_mode 无效' });
  for (const field of ['file_path', 'sha256', 'kind', 'coverage', 'purpose']) if (!String(source[field] || '').trim()) errors.push({ code: 'missing_field', index, field, message: field + ' 不能为空' });
  const sourcePath = source.file_path ? resolve(root, source.file_path) : null;
  if (sourcePath && !existsSync(sourcePath)) errors.push({ code: 'missing_file', index, message: '来源文件不存在：' + source.file_path });
  else if (sourcePath && statSync(sourcePath).isFile()) {
    const actualHash = hashOf(sourcePath);
    if (source.sha256 !== actualHash) errors.push({ code: 'source_hash_mismatch', index, message: '来源 Hash 与真实文件不一致：' + source.file_path });
  }
  if (source.sha256 && !/^[a-f0-9]{64}$/.test(source.sha256)) errors.push({ code: 'source_sha256', index, message: 'sha256 必须为 64 位小写十六进制' });
  const needsCompanion = source.read_mode !== 'unread' && binaryTextExtensions.has(extname(source.file_path || '').toLowerCase());
  if (needsCompanion && !source.audit_companion) {
    errors.push({ code: 'missing_audit_companion', index, message: 'PDF、Word、PPT 必须先生成机器审计副本：' + source.file_path });
  }
  if (source.audit_companion) {
    const companion = source.audit_companion;
    const companionPath = resolve(indexDir, companion.file_path || '');
    if (!companion.file_path || !existsSync(companionPath)) errors.push({ code: 'missing_audit_companion_file', index, message: '机器审计副本不存在：' + (companion.file_path || '') });
    else if (companion.sha256 !== hashOf(companionPath)) errors.push({ code: 'audit_companion_hash_mismatch', index, message: '机器审计副本 Hash 不一致：' + companion.file_path });
    if (companion.source_sha256 !== source.sha256) errors.push({ code: 'audit_companion_source_hash', index, message: '机器审计副本没有绑定当前原始来源 Hash' });
    if (!String(companion.extraction_method || '').trim()) errors.push({ code: 'audit_companion_method', index, message: '机器审计副本必须记录 extraction_method' });
  }
  if (source.read_mode === 'sampled' && !String(source.coverage || '').trim()) errors.push({ code: 'sample_coverage', index, message: 'sampled 必须记录实际覆盖范围' });
}
finish(errors.length === 0, errors);
