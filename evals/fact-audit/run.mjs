import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';
import { classifyAuditIssues, numericTokens } from '../../scripts/lib/final-fact-audit.mjs';

const root = resolve(import.meta.dirname, '../..');
const normalized = numericTokens('预算200万元，增长-12.5%，目标40-50%。');
assert(normalized[0].values[0] === 2_000_000, '万元必须归一');
assert(normalized[1].values[0] === -12.5, '负数不能被识别为区间');
assert(normalized[2].values.length === 2, '数字区间必须保留两个端点');

const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-fact-'));
const sourceRoot = join(temp, 'source');
mkdirSync(sourceRoot);
const researchBytes = Buffer.from('# 研究\n\n2025 年转化率增长 12.5%，样本为 800 人。\n');
writeFileSync(join(sourceRoot, 'research.md'), researchBytes);
const sourceIndex = join(temp, 'source-index.json');
writeFileSync(sourceIndex, JSON.stringify({
  contract_version: 'source-index/1.1.0', source_root: 'source',
  sources: [{ source_id: 'src-research', file_path: 'research.md', sha256: createHash('sha256').update(researchBytes).digest('hex'), kind: 'markdown', read_mode: 'full', coverage: '全文', purpose: '事实来源', audit_companion: null }],
}, null, 2));
const materials = join(temp, 'materials.json');
writeFileSync(materials, JSON.stringify({
  contract_version: 'page-material-packs/1.0.0', architecture_sha256: '0'.repeat(64),
  packs: [{ page_number: 1, page_job: '展示研究事实', materials: [{ source_id: 'src-research', locator: '研究', excerpt: '2025 年转化率增长 12.5%，样本为 800 人。', relationship: 'supports', used_in: '页面数字' }], asset_ids: [], content_development: ['数据说明'], gaps: [] }],
}, null, 2));
const copy = join(temp, 'bypage.md');
writeFileSync(copy, `---
contract_version: 1.0.0
page_number: 1
section_id: sec-data
page_type: data
page_title: "研究结果"
main_message: "研究显示转化改善"
---

## Page Content

2025 年转化率增长 12.5%，样本为 800 人。

建议首轮预算的 60% 用于验证内容方向。

## Speaker Notes

无。

## Production Notes

标明样本口径。

## Sources

- src-research · 研究
`);
const audit = join(temp, 'fact-audit.json');
const prepared = jsonOutput(runNode(join(root, 'scripts/audit-final-copy.mjs'), ['--mode', 'prepare', '--copy', copy, '--source-index', sourceIndex, '--materials', materials, '--source-root', sourceRoot, '--audit', audit]));
assert(prepared.summary.total_numbers === 4, '必须覆盖实际可见的全部数字');
const stored = JSON.parse(readFileSync(audit, 'utf8'));
const decisions = join(temp, 'decisions.json');
writeFileSync(decisions, JSON.stringify({
  contract_version: 'fact-audit-decisions/1.0.0',
  copy_sha256: stored.copy_sha256,
  decisions: stored.facts.map(fact => ({
    fact_id: fact.fact_id,
    status: fact.items.some(item => item.kind === 'planned_value') ? 'qualified' : 'verified',
    note_zh: '对象、时间、单位、来源和建议性质已经核对。',
    items: [],
  })),
}, null, 2));
runNode(join(root, 'scripts/audit-final-copy.mjs'), ['--mode', 'resolve', '--copy', copy, '--audit', audit, '--decisions', decisions]);
assert(jsonOutput(runNode(join(root, 'scripts/audit-final-copy.mjs'), ['--mode', 'check', '--copy', copy, '--audit', audit])).valid, '语义决定后必须从真实来源复算通过');
const unchanged = readFileSync(copy, 'utf8');
writeFileSync(copy, unchanged.replace('预算的 60%', '预算的 65%'));
const incremental = jsonOutput(runNode(join(root, 'scripts/audit-final-copy.mjs'), ['--mode', 'prepare', '--copy', copy, '--source-index', sourceIndex, '--materials', materials, '--source-root', sourceRoot, '--audit', audit]));
assert(incremental.summary.carried_unchanged >= 1 && incremental.summary.changed === 1, '局部改文案必须只重查变化事实');

const pdfBytes = Buffer.from('binary-pdf-placeholder');
writeFileSync(join(sourceRoot, 'report.pdf'), pdfBytes);
mkdirSync(join(temp, 'audit-sources'));
const companionBytes = Buffer.from('=== PAGE 1 ===\n报告样本为 1,000 人。\n表格变化为 -1.76。\n');
writeFileSync(join(temp, 'audit-sources/src-report.txt'), companionBytes);
writeFileSync(sourceIndex, JSON.stringify({
  contract_version: 'source-index/1.1.0', source_root: 'source',
  sources: [{
    source_id: 'src-report', file_path: 'report.pdf', sha256: createHash('sha256').update(pdfBytes).digest('hex'), kind: 'pdf', read_mode: 'full', coverage: '全文', purpose: 'PDF 事实来源',
    audit_companion: { file_path: 'audit-sources/src-report.txt', sha256: createHash('sha256').update(companionBytes).digest('hex'), source_sha256: createHash('sha256').update(pdfBytes).digest('hex'), extraction_method: 'fixture-text-layer' },
  }],
}, null, 2));
assert(jsonOutput(runNode(join(root, 'scripts/validate-source-index.mjs'), [sourceIndex])).valid, '二进制来源必须绑定有效机器审计副本');
const pdfMaterials = join(temp, 'pdf-materials.json');
writeFileSync(pdfMaterials, JSON.stringify({
  contract_version: 'page-material-packs/1.0.0', architecture_sha256: '0'.repeat(64),
  packs: [{ page_number: 1, page_job: '展示 PDF 事实', materials: [{ source_id: 'src-report', locator: 'PDF p1', excerpt: '报告样本为 1,000 人。', relationship: 'supports', used_in: '页面数字' }], asset_ids: [], content_development: ['数据说明'], gaps: [] }],
}, null, 2));
const pdfCopy = join(temp, 'pdf-bypage.md');
writeFileSync(pdfCopy, `---
contract_version: 1.0.0
page_number: 1
section_id: sec-pdf
page_type: data
page_title: "PDF 数据"
main_message: "样本口径"
---

## Page Content

报告样本为 1,000 人。

## Speaker Notes

无。

## Production Notes

无。

## Sources

- src-report · PDF p1
`);
const pdfAudit = join(temp, 'pdf-audit.json');
runNode(join(root, 'scripts/audit-final-copy.mjs'), ['--mode', 'prepare', '--copy', pdfCopy, '--source-index', sourceIndex, '--materials', pdfMaterials, '--source-root', sourceRoot, '--audit', pdfAudit]);
const pdfStored = JSON.parse(readFileSync(pdfAudit, 'utf8'));
const pdfItem = pdfStored.facts.flatMap(fact => fact.items).find(item => item.raw.includes('1,000'));
assert(pdfItem.source_path === 'report.pdf' && pdfItem.audit_path === 'audit-sources/src-report.txt' && pdfItem.mechanical_status.startsWith('located_'), '审计必须保留原始 PDF 定位，同时自动使用机器审计副本');
const signMaterials = join(temp, 'sign-materials.json');
writeFileSync(signMaterials, JSON.stringify({
  contract_version: 'page-material-packs/1.0.0', architecture_sha256: '0'.repeat(64),
  packs: [{ page_number: 1, page_job: '展示表格变化', materials: [{ source_id: 'src-report', locator: 'PDF p1', excerpt: '表格变化为 +1.76。', relationship: 'supports', used_in: '页面数字' }], asset_ids: [], content_development: ['表格'], gaps: [] }],
}, null, 2));
const signCopy = join(temp, 'sign-bypage.md');
writeFileSync(signCopy, `---
contract_version: 1.0.0
page_number: 1
section_id: sec-sign
page_type: data
page_title: "符号检查"
main_message: "保留来源符号"
---

## Page Content

表格变化为 +1.76。

## Speaker Notes

无。

## Production Notes

无。

## Sources

- src-report · PDF p1
`);
const signAudit = join(temp, 'sign-audit.json');
runNode(join(root, 'scripts/audit-final-copy.mjs'), ['--mode', 'prepare', '--copy', signCopy, '--source-index', sourceIndex, '--materials', signMaterials, '--source-root', sourceRoot, '--audit', signAudit]);
const signItem = JSON.parse(readFileSync(signAudit, 'utf8')).facts.flatMap(fact => fact.items).find(item => item.raw.includes('1.76'));
assert(signItem.mechanical_status === 'sign_mismatch', '正负号相反必须返回 sign_mismatch，而不是模糊的 not_found 或符号容差');
const crossFactIssues = classifyAuditIssues({ facts: [
  {
    fact_id: 'fact-operands', page_number: 1, claim_text: '基线为 10，比较值为 5。', semantic_status: 'verified', semantic_notes_zh: '', semantic_review_reasons: [],
    items: [
      { token_id: 'token-ten', raw: '10', values: [10], kind: 'sourced_fact', suggested_kind: 'sourced_fact', kind_locked: false, source_path: 'report.pdf', mechanical_status: 'located_exact' },
      { token_id: 'token-five', raw: '5', values: [5], kind: 'sourced_fact', suggested_kind: 'sourced_fact', kind_locked: false, source_path: 'report.pdf', mechanical_status: 'located_exact' },
    ],
  },
  {
    fact_id: 'fact-result', page_number: 1, claim_text: '因此是 2 倍。', semantic_status: 'verified', semantic_notes_zh: '', semantic_review_reasons: [],
    items: [{
      token_id: 'token-two', raw: '2倍', values: [2], kind: 'derived_fact', suggested_kind: 'derived_fact', kind_locked: false, source_path: null, mechanical_status: 'unresolved',
      derivation: { operands: [10, 5], operand_refs: ['token-ten', 'token-five'], operator: 'divide', displayed_value: 2, comparison: 'equal' },
      derivation_result: { calculated: 2, valid: true },
    }],
  },
] });
assert(crossFactIssues.hard_errors.length === 0, '跨句衍生公式必须允许通过精确 operand_refs 追溯，而不是放宽为同页数字碰撞');
pass('实际使用事实审计与增量恢复');
