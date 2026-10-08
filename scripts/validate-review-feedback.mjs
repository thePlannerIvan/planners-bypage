#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { moduleScript } from './lib/planners-modules.mjs';
import { copyPageNumbers } from './lib/copy-pages.mjs';
import {reviewSourceHash} from './lib/review-source-hash.mjs';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) out[argv[index]] = argv[index + 1];
  return out;
}
const args = argsOf(process.argv.slice(2));
if (!args['--feedback'] || !args['--copy']) {
  process.stdout.write(`${JSON.stringify({ valid: false, error: '用法：--feedback <file> --copy <file> [--audit <file>] [--kind sample|final]' })}\n`);
  process.exit(2);
}
const kind = args['--kind'] || 'final';
let feedback;
let copyRaw;
let auditRaw = '';
let factExceptionPages = new Set();
try {
  feedback = JSON.parse(readFileSync(resolve(args['--feedback']), 'utf8'));
  copyRaw = readFileSync(resolve(args['--copy']), 'utf8');
  if (args['--audit']) {
    const auditPath = resolve(args['--audit']);
    auditRaw = readFileSync(auditPath, 'utf8');
    const audit = JSON.parse(auditRaw);
    if (audit.contract_version !== 'fact-audit/1.0.0') throw new Error('fact-audit.json 必须为 fact-audit/1.0.0');
    const gate = spawnSync(process.execPath, [
      moduleScript('planners-fact-check', 'scripts/validate-fact-audit.mjs'), auditPath, '--gate',
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    let checked;
    try { checked = JSON.parse(gate.stdout); } catch { throw new Error(`事实核查校验器没有返回 JSON：${(gate.stderr || '').slice(0, 200)}`); }
    if ((checked.errors || []).length) {
      throw new Error(`事实审计仍有硬错误：${checked.errors.map(e => e.message).join('；')}`);
    }
    const adapter = spawnSync(process.execPath, [resolve(import.meta.dirname, 'validate-fact-audit.mjs'),
      '--audit', auditPath, '--copy', resolve(args['--copy']), '--allow-human-review', 'true'], { encoding: 'utf8' });
    if (adapter.status !== 0) throw new Error(`事实例外与页面映射无效：${adapter.stdout || adapter.stderr}`);
    // All factual exceptions must map to actual review pages.
    factExceptionPages = new Set((audit.suspects || [])
      .filter(s => ['confirmed', 'accepted_with_caveat', 'no_source'].includes(s.verdict))
      .map(s => Number(s.location?.page))
      .filter(Number.isInteger));
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ valid: false, error: error.message })}\n`);
  process.exit(2);
}
const errors = [];
let assetManifestPath = args['--manifest'] ? resolve(args['--manifest']) : null;
const contextPath = resolve(dirname(resolve(args['--feedback'])), 'review-context.json');
if (existsSync(contextPath)) {
  try {
    const context = JSON.parse(readFileSync(contextPath, 'utf8'));
    if (context.assetManifestPath) {
      const reviewedPath = resolve(context.assetManifestPath);
      if (assetManifestPath && reviewedPath !== assetManifestPath) {
        throw new Error('资产清单与审阅上下文不一致');
      }
      assetManifestPath = reviewedPath;
    }
  } catch (error) { errors.push(`审阅资产上下文不可读：${error.message}`); }
}
let manifestRaw = null;
if (assetManifestPath) {
  try { manifestRaw = readFileSync(assetManifestPath, 'utf8'); }
  catch (error) { errors.push(`资产清单不可读：${error.message}`); }
}
const expectedHash = reviewSourceHash({copy: copyRaw, audit: auditRaw, manifest: manifestRaw});
if (feedback.contract_version !== '1.1.0') errors.push('contract_version 必须为 1.1.0');
const expectedKind = kind === 'sample' ? 'bypage_sample' : 'bypage';
if (feedback.review_kind !== expectedKind) errors.push('review_kind 不匹配');
if (feedback.source_sha256 !== expectedHash) errors.push('反馈没有绑定当前文案与事实审计');
const expectedPages = copyPageNumbers(copyRaw);
const decisions = Array.isArray(feedback.decisions) ? feedback.decisions : [];
const decisionPages = decisions.map(item => item.page_number);
if (decisions.length !== expectedPages.length || new Set(decisionPages).size !== expectedPages.length
  || expectedPages.some(page => !decisionPages.includes(page))
  || decisionPages.some(page => !expectedPages.includes(page))) errors.push('反馈必须恰好覆盖每一页');
for (const item of decisions) {
  if (!['approve', 'revise'].includes(item.decision)) errors.push(`第 ${item.page_number} 页决定无效`);
  if (item.decision === 'revise' && !(item.feedback_zh || '').trim() && !(item.attachments || []).length) errors.push(`第 ${item.page_number} 页需要修改时必须填写反馈或上传替换图片`);
  if (factExceptionPages.has(Number(item.page_number))) {
    const expected = item.decision === 'approve' ? 'accept' : 'revise';
    if (item.fact_exception_decision !== expected) {
      errors.push(`第 ${item.page_number} 页含事实例外，必须明确接受或退回修改`);
    }
  }
}
for (const page of factExceptionPages) {
  if (!expectedPages.includes(page)) errors.push(`事实例外引用了不存在的第 ${page} 页`);
}
const hasRevision = decisions.some(item => item.decision === 'revise');
if (feedback.overall_decision !== (hasRevision ? 'revise' : 'approve')) errors.push('overall_decision 与逐页决定不一致');
process.stdout.write(`${JSON.stringify({ contract: 'bypage-review/1.0.0', valid: errors.length === 0, pages: expectedPages.length, errors })}\n`);
process.exit(errors.length ? 1 : 0);
