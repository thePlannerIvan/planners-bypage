#!/usr/bin/env node
/**
 * 事实核查在 bypage 这一侧的**接缝**：规则交给 planners-fact-check，这里只做翻译。
 *
 * 它把公共件的结论翻成审阅流程要的两样东西：
 *   · errors               —— 硬错误（含未裁定的疑点、审计绑定的不是这份稿）
 *   · human_review_required —— 必须人看的页：判为要改（confirmed）与带保留接受（accepted_with_caveat）
 *
 * 用法（与旧版一致，消费者不用改）：
 *   node scripts/validate-fact-audit.mjs --audit <fact-audit.json> --copy <bypage-draft.md> [--allow-human-review true]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { moduleScript } from './lib/planners-modules.mjs';
import { copyPageNumbers } from './lib/copy-pages.mjs';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 2) out[argv[index]] = argv[index + 1];
  return out;
}
const emit = (payload, code) => { process.stdout.write(`${JSON.stringify(payload)}\n`); process.exit(code); };

const args = argsOf(process.argv.slice(2));
if (!args['--audit'] || !args['--copy']) {
  emit({ valid: false, error: '用法：--audit <fact-audit.json> --copy <bypage-draft.md> [--allow-human-review true]' }, 2);
}
const auditPath = resolve(args['--audit']);
const copyPath = resolve(args['--copy']);
if (!existsSync(auditPath)) emit({ valid: false, error: `事实审计不存在：${auditPath}` }, 2);

let audit;
let checked;
try {
  audit = JSON.parse(readFileSync(auditPath, 'utf8'));
  if (audit.contract_version !== 'fact-audit/1.0.0') throw new Error('fact-audit.json 必须为 fact-audit/1.0.0');
  const cli = moduleScript('planners-fact-check', 'scripts/validate-fact-audit.mjs');
  const run = spawnSync(process.execPath, [cli, auditPath, '--gate'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  checked = JSON.parse(run.stdout);
} catch (error) {
  emit({ valid: false, error: error.message }, 2);
}

const errors = (checked.errors || []).map(e => `[${e.code}] ${e.message}`);
// 这份审计绑的是不是当前这份稿
const copyHash = createHash('sha256').update(readFileSync(copyPath)).digest('hex');
if (audit.artifact?.sha256 !== copyHash) {
  errors.push(`事实审计绑定的不是这份稿（审计绑 ${String(audit.artifact?.sha256 || '').slice(0, 12)}…，当前稿 ${copyHash.slice(0, 12)}…）`);
}

const suspects = audit.suspects || [];
const pages = copyPageNumbers(readFileSync(copyPath, 'utf8'));
for (const suspect of suspects) {
  if (['confirmed', 'accepted_with_caveat', 'no_source'].includes(suspect.verdict)
    && !pages.includes(suspect.location?.page)) {
    errors.push(`[suspect_page_missing] ${suspect.id} 必须定位到正式稿中的真实页码`);
  }
}
const pageOf = s => (Number.isInteger(s.location?.page) ? Number(s.location.page) : null);
const humanReviewRequired = suspects
  .filter(s => ['confirmed', 'accepted_with_caveat', 'no_source'].includes(s.verdict))
  .map(s => ({ id: s.id, page_number: pageOf(s), surface: s.surface, kind: s.kind, verdict: s.verdict, note: s.note || '' }));

const allowHumanReview = args['--allow-human-review'] === 'true';
const reviewable = errors.length === 0;
const valid = reviewable && (allowHumanReview || humanReviewRequired.length === 0);

emit({
  contract: 'fact-audit/1.0.0',
  valid,
  reviewable,
  requires_human_review: humanReviewRequired.length > 0,
  summary: {
    suspects: suspects.length,
    confirmed: suspects.filter(s => s.verdict === 'confirmed').length,
    caveat: suspects.filter(s => s.verdict === 'accepted_with_caveat').length,
    correct: suspects.filter(s => s.verdict === 'correct').length,
    blind_spots: (audit.blind_spots || []).length,
  },
  errors,
  human_review_required: humanReviewRequired,
}, valid ? 0 : 1);
