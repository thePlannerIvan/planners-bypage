#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 2) args[process.argv.slice(2)[i]] = process.argv.slice(2)[i + 1];
const finish = (valid, errors, code = valid ? 0 : 1) => {
  process.stdout.write(JSON.stringify({ contract: 'storyline-review/1.0.0', valid, errors }) + '\n');
  process.exit(code);
};
for (const key of ['--feedback', '--architecture', '--assets']) if (!args[key]) finish(false, ['缺少 ' + key], 2);
let feedback, architectureRaw, architecture, manifestRaw;
try {
  feedback = JSON.parse(readFileSync(resolve(args['--feedback']), 'utf8'));
  architectureRaw = readFileSync(resolve(args['--architecture']), 'utf8');
  architecture = JSON.parse(architectureRaw);
  manifestRaw = readFileSync(resolve(args['--assets']), 'utf8');
} catch (error) { finish(false, [error.message], 2); }
const errors = [];
const expectedHash = createHash('sha256').update(architectureRaw).update('\n---ASSET-MANIFEST---\n').update(manifestRaw).digest('hex');
if (feedback.contract_version !== '1.1.0') errors.push('contract_version 无效');
if (feedback.review_kind !== 'storyline') errors.push('review_kind 必须为 storyline');
if (feedback.source_sha256 !== expectedHash) errors.push('反馈没有绑定当前页面架构与资产清单');
const decisions = Array.isArray(feedback.decisions) ? feedback.decisions : [];
const expectedPages = architecture.pages.map(page => page.page_number);
if (decisions.length !== expectedPages.length || expectedPages.some(page => !decisions.some(item => item.page_number === page))) errors.push('反馈必须覆盖每一页');
for (const page of architecture.pages) {
  const decision = decisions.find(item => item.page_number === page.page_number);
  if (!decision) continue;
  if (!['approve', 'revise'].includes(decision.decision)) errors.push('第 ' + page.page_number + ' 页决定无效');
  const expectedAssets = [...page.recommended_assets, ...page.other_candidate_assets].map(item => item.asset_id);
  const assetDecisions = decision.asset_decisions || [];
  if (expectedAssets.length && (assetDecisions.length !== expectedAssets.length || expectedAssets.some(id => !assetDecisions.some(item => item.asset_id === id)))) errors.push('第 ' + page.page_number + ' 页图片决定不完整');
  for (const item of assetDecisions) if (!['selected', 'backup', 'excluded', 'replace'].includes(item.status)) errors.push('第 ' + page.page_number + ' 页图片状态无效');
  if (decision.decision === 'revise' && !String(decision.feedback_zh || '').trim() && !assetDecisions.length && !(decision.attachments || []).length) errors.push('第 ' + page.page_number + ' 页需要修改但没有反馈内容');
}
const hasRevision = decisions.some(item => item.decision === 'revise');
if (feedback.overall_decision !== (hasRevision ? 'revise' : 'approve')) errors.push('overall_decision 与逐页决定不一致');
finish(errors.length === 0, errors);
