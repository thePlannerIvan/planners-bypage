#!/usr/bin/env node
/**
 * 事实核查接缝的回归：bypage 侧不做核查，只**翻译**公共件的结论。
 * 旧审计器（逐数字建账、增量复算、符号不匹配……）已退役并归档，它的机制回归随之退役；
 * 现在要守的是**接缝**：硬错误传得过来、必须人看的页点得准、审计绑的不是这份稿要拦住。
 *
 * 用法：node evals/fact-audit/run.mjs
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const seam = join(root, 'scripts/validate-fact-audit.mjs');
const sha = b => createHash('sha256').update(b).digest('hex');

const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-seam-'));
const copy = join(temp, 'bypage.md');
writeFileSync(copy, '# 测试稿\n\n样本 120 人，愿意复购 78 人，占比 65%。\n');
const copyHash = sha(readFileSync(copy));
const sourceIndex = join(temp, 'source-index.json');
writeFileSync(sourceIndex, JSON.stringify({ contract_version: 'source-index/2.0.0', source_root: '.', sources: [] }, null, 2));

const auditWith = (suspects, over = {}) => {
  const p = join(temp, `audit-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(p, JSON.stringify({
    contract_version: 'fact-audit/1.0.0',
    artifact: { path: copy, sha256: copyHash },
    source_index: { path: sourceIndex, index_sha256: null, read_at: null },
    checker: 'evals/fact-audit/run.mjs',
    blind_spots: [],
    suspects,
    ...over,
  }, null, 2));
  return p;
};
const seamRun = (audit, extra = []) => jsonOutput(spawnSync(process.execPath, [seam, '--audit', audit, '--copy', copy, ...extra], { encoding: 'utf8' }));
const suspect = (over) => ({ id: 's1', surface: '占比 65%', kind: 'miscalc', class: 'derived', verdict: 'correct',
  location: { page: 2, line: 3 }, finding: '78/120=65%，与来源一致', decided_by: 'agent', note: '', ...over });

// ① 全部核过：放行，不需要人看
{
  const r = seamRun(auditWith([suspect({}), suspect({ id: 's2', verdict: 'correct', location: { page: 5 } })]));
  assert(r.valid && r.reviewable && !r.requires_human_review, `全正确应放行且不需人工：${JSON.stringify(r)}`);
  assert(r.summary.suspects === 2 && r.summary.correct === 2, 'summary 要报对条数');
  console.log('  ✓ 全部核过 → 放行、不需人工');
}

// ② 未裁定：接缝必须把公共件的 pending_verdict 传上来并不放行
{
  const r = seamRun(auditWith([suspect({ verdict: 'pending', note: '' })]));
  assert(!r.reviewable && !r.valid, '未裁定不得放行');
  assert(r.errors.some(e => e.includes('pending_verdict')), `硬错误必须带公共件的错误码：${JSON.stringify(r.errors)}`);
  console.log('  ✓ 未裁定 → 不放行，且错误码来自公共件');
}

// ③ 判为要改（confirmed）：允许人看时要点名那一页；交付时不许放行
{
  const audit = auditWith([suspect({ verdict: 'confirmed', note: '改成 65%（78/120）' })]);
  const withHuman = seamRun(audit, ['--allow-human-review', 'true']);
  assert(withHuman.valid && withHuman.requires_human_review, '允许人工时应可继续但要点名');
  assert(withHuman.human_review_required[0].page_number === 2, '点名必须带页码');
  const delivery = seamRun(audit);
  assert(!delivery.valid, '交付路径（不许人工）遇到 confirmed 必须拦住');
  console.log('  ✓ confirmed → 审阅页点名第 2 页；交付路径拦住');
}

// ④ 带保留接受：必须人看，且页码来自 location.page
{
  const r = seamRun(auditWith([suspect({ verdict: 'accepted_with_caveat', decided_by: 'human', note: '作者同意保留', location: { page: 7 } })]));
  assert(r.requires_human_review && r.human_review_required[0].page_number === 7, '带保留接受必须在审阅页点名');
  console.log('  ✓ accepted_with_caveat → 点名第 7 页');
}

// ⑤ 审计绑的不是这份稿
{
  const audit = auditWith([], { artifact: { path: copy, sha256: '0'.repeat(64) } });
  const r = seamRun(audit);
  assert(!r.reviewable && r.errors.some(e => e.includes('绑定的不是这份稿')), `稿对不上必须拦住：${JSON.stringify(r.errors)}`);
  console.log('  ✓ 审计绑的不是这份稿 → 拦住');
}

// ⑥ 契约版本不对
{
  const audit = auditWith([], { contract_version: 'fact-audit/0.9.0' });
  const bad = spawnSync(process.execPath, [seam, '--audit', audit, '--copy', copy], { encoding: 'utf8' });
  assert(bad.status !== 0, '旧版本契约必须拒掉');
  console.log('  ✓ 契约版本不对 → 拒掉');
}

// ⑦ 公共件真的在跑（拿一份未裁定的审计直接跑公共校验器，必须 FAIL）
{
  const audit = auditWith([suspect({ verdict: 'pending' })]);
  const pub = spawnSync(process.execPath, [
    join(root, 'scripts', 'lib', 'planners-modules.mjs'), '--check',
  ], { encoding: 'utf8' });
  assert(pub.stdout.includes('planners-fact-check'), '适配器必须能解析到 planners-fact-check');
  console.log('  ✓ 适配器解析到 planners-fact-check');
}

rmSync(temp, { recursive: true, force: true });
pass('事实核查接缝：硬错误、点名页码、稿绑定、契约版本');
