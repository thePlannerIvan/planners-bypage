#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { moduleScript } from './lib/planners-modules.mjs';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) out[argv[index]] = argv[index + 1];
  return out;
}
function pageNumbers(content) {
  return [...content.matchAll(/^page_number:\s*(\d+)\s*$/gm)].map(match => Number(match[1]));
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
    // 必须人看的页：判为要改（confirmed）与带保留接受（accepted_with_caveat）
    factExceptionPages = new Set((audit.suspects || [])
      .filter(s => s.verdict === 'confirmed' || s.verdict === 'accepted_with_caveat')
      .map(s => Number(s.location?.page))
      .filter(Number.isInteger));
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ valid: false, error: error.message })}\n`);
  process.exit(2);
}
const errors = [];
const expectedHash = createHash('sha256').update(copyRaw).update('\n---FACT-AUDIT---\n').update(auditRaw).digest('hex');
if (feedback.contract_version !== '1.1.0') errors.push('contract_version 必须为 1.1.0');
const expectedKind = kind === 'sample' ? 'bypage_sample' : 'bypage';
if (feedback.review_kind !== expectedKind) errors.push('review_kind 不匹配');
if (feedback.source_sha256 !== expectedHash) errors.push('反馈没有绑定当前文案与事实审计');
const expectedPages = pageNumbers(copyRaw);
const decisions = Array.isArray(feedback.decisions) ? feedback.decisions : [];
const decisionPages = decisions.map(item => item.page_number);
if (new Set(decisionPages).size !== expectedPages.length
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
const hasRevision = decisions.some(item => item.decision === 'revise');
if (feedback.overall_decision !== (hasRevision ? 'revise' : 'approve')) errors.push('overall_decision 与逐页决定不一致');
process.stdout.write(`${JSON.stringify({ contract: 'bypage-review/1.0.0', valid: errors.length === 0, pages: expectedPages.length, errors })}\n`);
process.exit(errors.length ? 1 : 0);
