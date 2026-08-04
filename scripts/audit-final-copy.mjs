#!/usr/bin/env node
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildAudit, classifyAuditIssues, splitVisiblePages, summarizeFacts,
} from './lib/final-fact-audit.mjs';

const MODE_GUIDE = {
  prepare: {
    required: ['--copy', '--source-index', '--materials', '--source-root', '--audit'],
    example: 'node audit-final-copy.mjs --mode prepare --copy <bypage-draft.md> --source-index <source-index.json> --materials <page-material-packs.json> --source-root <source-root> --audit <fact-audit.json>',
    next_action_zh: '生成事实审计、独立归属队列和数字到原文片段的机器映射。',
  },
  confirm: {
    required: ['--copy', '--audit'],
    example: 'node audit-final-copy.mjs --mode confirm --copy <bypage-draft.md> --audit <fact-audit.json>',
    next_action_zh: '只自动确认无外部归属风险的方案数字和非事实编号；来源事实仍须独立核对。',
  },
  resolve: {
    required: ['--copy', '--audit', '--decisions'],
    example: 'node audit-final-copy.mjs --mode resolve --copy <bypage-draft.md> --audit <fact-audit.json> --decisions <fact-audit-decisions.json>',
    next_action_zh: '仅根据 fact-audit-review-queue.json 和其引用的原文片段完成独立归属判断。',
  },
  check: {
    required: ['--copy', '--audit'],
    example: 'node audit-final-copy.mjs --mode check --copy <bypage-draft.md> --audit <fact-audit.json>',
    next_action_zh: '在打开 By-page 终审前复算并检查所有状态。',
  },
};
let activeMode = 'help';

process.on('uncaughtException', error => {
  const guide = MODE_GUIDE[activeMode] || null;
  process.stdout.write(`${JSON.stringify({
    valid: false,
    error: error.message,
    mode: activeMode,
    required: guide?.required || [],
    example: guide?.example || null,
    next_action_zh: guide?.next_action_zh || '运行 --help 查看完整状态机。',
  })}\n`);
  process.exit(1);
});

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1];
    if (value && !value.startsWith('--')) {
      out[key] = value;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function required(args, keys) {
  for (const key of keys) if (!args[key]) throw new Error(`缺少 ${key}`);
}

function validatePrepareInputs(copyPath, sourceIndexPath, materialsPath, sourceRoot) {
  for (const [label, path] of [
    ['source-index', sourceIndexPath],
    ['page-material-packs', materialsPath],
    ['source-root', sourceRoot],
  ]) {
    if (!existsSync(path)) throw new Error(`${label} 不存在：${path}`);
  }
  const materialData = JSON.parse(readFileSync(materialsPath, 'utf8'));
  const packs = Array.isArray(materialData) ? materialData : materialData.packs || [];
  if (!packs.length) throw new Error('page-material-packs 没有任何页面材料包，必须先完成 P2');
  const sourceData = JSON.parse(readFileSync(sourceIndexPath, 'utf8'));
  const sourceRows = Array.isArray(sourceData) ? sourceData : sourceData.sources || sourceData.files || [];
  if (!sourceRows.length) throw new Error('source-index 没有任何来源，必须先完成 P1');
  const packedPages = new Set(packs.map(pack => Number(pack.page_number)));
  const copyPages = splitVisiblePages(readFileSync(copyPath, 'utf8')).map(page => page.page_number);
  const missingPages = copyPages.filter(page => !packedPages.has(page));
  if (missingPages.length) {
    throw new Error(`page-material-packs 缺少页面：${missingPages.join('、')}；必须先完成 P2`);
  }
}

function provisionalDecision(fact) {
  return {
    ...fact,
    semantic_status: (fact.items || []).some(item => item.kind === 'planned_value')
      ? 'qualified' : 'verified',
    semantic_notes_zh: (fact.semantic_review_reasons || []).length ? '脚本临时机械检查' : '',
  };
}

function factIssues(fact, provisional = true) {
  return classifyAuditIssues({ facts: [provisional ? provisionalDecision(fact) : fact] });
}

function compactEvidence(fact) {
  const seen = new Set();
  const evidence = [];
  for (const item of fact.items || []) {
    if (!['sourced_fact', 'pending'].includes(item.kind)) continue;
    for (const candidate of (item.source_candidates || []).slice(0, 2)) {
      const key = `${candidate.source_path}\n${candidate.evidence_excerpt || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push({
        source_id: candidate.source_id,
        source_path: candidate.source_path,
        audit_path: candidate.audit_path || null,
        locator: candidate.locator,
        mechanical_status: candidate.mechanical_status,
        excerpt: candidate.evidence_excerpt || '',
      });
      if (evidence.length >= 2) return evidence;
    }
  }
  return evidence;
}

function numberEvidencePayload(item) {
  const selected = (item.source_candidates || []).find(candidate =>
    candidate.source_path === item.source_path) || item.source_candidates?.[0];
  return {
    token_id: item.token_id,
    raw: item.raw,
    kind: item.kind,
    suggested_kind: item.suggested_kind,
    classification_reason: item.classification_reason,
    source: item.source_path || null,
    mechanical_status: item.mechanical_status,
    selected_source_mapping: item.source_path ? {
      source_id: item.source_id || null,
      source_path: item.source_path,
      audit_path: item.audit_path || null,
      locator: item.locator || '',
      evidence_excerpt: selected?.evidence_excerpt || '',
    } : null,
    source_candidates: (item.source_candidates || []).slice(0, 3).map(candidate => ({
      source_id: candidate.source_id,
      source_path: candidate.source_path,
      audit_path: candidate.audit_path || null,
      locator: candidate.locator || '',
      mechanical_status: candidate.mechanical_status,
      evidence_excerpt: candidate.evidence_excerpt || '',
    })),
  };
}

function compactQueue(facts) {
  return facts
    .map(fact => ({
      fact,
      issues: factIssues(fact, fact.semantic_status === 'pending'),
    }))
    .filter(({ issues }) => issues.hard_errors.length || issues.human_review_required.length)
    .map(({ fact, issues }) => ({
        fact_id: fact.fact_id,
        page: fact.page_number,
        text: fact.claim_text,
        numbers: (fact.items || []).map(numberEvidencePayload),
        blocking_errors: issues.hard_errors,
        human_review_required: issues.human_review_required,
        evidence_candidates: compactEvidence(fact),
        carry_state: fact.carry_state,
      }));
}

function semanticQueue(facts) {
  return facts
    .filter(fact => fact.semantic_status === 'pending'
      && ((fact.semantic_review_reasons || []).length > 0
        || (fact.items || []).some(item => ['sourced_fact', 'derived_fact'].includes(item.kind)))
      && factIssues(fact).hard_errors.length === 0)
    .map(fact => ({
      fact_id: fact.fact_id,
      page: fact.page_number,
      text: fact.claim_text,
      why_model_is_needed: (fact.semantic_review_reasons || []).length
        ? fact.semantic_review_reasons
        : ['来源事实不允许由 confirm 批量放行，需要从原文片段反向核对归属。'],
      independent_attribution_checks: [
        '主体或公司名是否与原文一致',
        '数字对应的指标、对象和单位是否一致',
        '时间范围、截止日期或计划属性是否一致',
        '适用环节、人群、地域、层级和其他限定词是否遗漏',
        '正负号、约数、至少/至多和四舍五入关系是否一致',
      ],
      allowed_decisions: ['verified', 'qualified', 'fix_required', 'user_review_required'],
      evidence_candidates: compactEvidence(fact),
      numbers: (fact.items || []).map(numberEvidencePayload),
    }));
}

function autoConfirmable(fact) {
  const external = (fact.items || []).some(item => ['sourced_fact', 'derived_fact'].includes(item.kind));
  return fact.semantic_status === 'pending'
    && !external
    && (fact.semantic_review_reasons || []).length === 0
    && factIssues(fact).hard_errors.length === 0;
}

function buildFromStored(copyPath, auditPath) {
  const stored = JSON.parse(readFileSync(auditPath, 'utf8'));
  if (stored.contract_version !== '2.0.0') throw new Error('fact-audit.json 必须为 2.0.0');
  return buildAudit({
    copyPath,
    sourceIndexPath: resolve(stored.source_index_path),
    materialsPath: resolve(stored.materials_path),
    sourceRoot: resolve(stored.source_root),
    previousAuditPath: auditPath,
  });
}

function reviewQueuePayload(current) {
  const blockingQueue = compactQueue(current.facts);
  const blockingIds = new Set(blockingQueue.map(item => item.fact_id));
  const semanticReviewQueue = semanticQueue(current.facts)
    .filter(item => !blockingIds.has(item.fact_id));
  return {
    contract_version: 'fact-audit-review-queue/1.1.0',
    copy_sha256: current.copy_sha256,
    audit_policy_version: current.audit_policy_version,
    instruction_zh: '把队列当作独立归属审计：不重读或凭记忆使用 bypage-draft，只比较每条 text 与其机器列出的原文片段。逐项核对主体、指标对象、时间、适用范围、单位和正负号；有任一限定不可见时不得 verified。每条选择 verified、qualified、fix_required 或 user_review_required；不要补写机械字段。',
    status_rules_zh: {
      verified: '来源事实的主体、数值、对象和全部限定均可见。',
      qualified: '明确是建议、目标、计划值，或文案中已显示必要限定。',
      fix_required: '归属、主体、指标、时间或限定词不匹配，必须修正文案或来源。',
      user_review_required: '原文或机器副本不足以裁决，需要用户明确选择。',
    },
    semantic_review_queue: semanticReviewQueue,
    blocking_queue: blockingQueue,
  };
}

function writeReviewQueue(queuePath, current) {
  const payload = reviewQueuePayload(current);
  mkdirSync(dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

function applyDecisions(stored, decisions) {
  if (decisions.contract_version !== 'fact-audit-decisions/1.0.0') {
    throw new Error('decisions 必须为 fact-audit-decisions/1.0.0');
  }
  if (decisions.copy_sha256 !== stored.copy_sha256) {
    throw new Error('decisions 没有绑定当前文案；请重新 prepare');
  }
  const facts = new Map((stored.facts || []).map(fact => [fact.fact_id, fact]));
  const sourceIndex = existsSync(stored.source_index_path)
    ? JSON.parse(readFileSync(stored.source_index_path, 'utf8'))
    : {};
  const sourceRows = Array.isArray(sourceIndex)
    ? sourceIndex
    : (sourceIndex.sources || sourceIndex.files || []);
  const allowedSourceIds = new Set();
  const allowedSourcePaths = new Set();
  for (const row of sourceRows) {
    const sourcePath = row.file_path || row.path || row.relative_path || null;
    const sourceId = row.source_id || row.id || sourcePath;
    if (sourceId) allowedSourceIds.add(sourceId);
    if (sourcePath) allowedSourcePaths.add(sourcePath);
  }
  const allowedStatuses = new Set(['verified', 'qualified', 'fix_required', 'user_review_required']);
  const allowedKinds = new Set(['sourced_fact', 'derived_fact', 'planned_value', 'non_factual']);
  for (const decision of decisions.decisions || []) {
    const fact = facts.get(decision.fact_id);
    if (!fact) throw new Error(`未知 fact_id：${decision.fact_id}`);
    if (!allowedStatuses.has(decision.status)) throw new Error(`${decision.fact_id}: status 非法`);
    fact.semantic_status = decision.status;
    fact.semantic_notes_zh = String(decision.note_zh || '').trim();
    if (decision.status === 'user_review_required' && !fact.semantic_notes_zh) {
      throw new Error(`${decision.fact_id}: 提交用户决定必须说明不确定点`);
    }
    if ((fact.semantic_review_reasons || []).length && !fact.semantic_notes_zh) {
      throw new Error(`${decision.fact_id}: 模糊项必须写一句简短判断`);
    }
    const items = new Map((fact.items || []).map(item => [item.token_id, item]));
    for (const itemDecision of decision.items || []) {
      const item = items.get(itemDecision.token_id);
      if (!item) throw new Error(`${decision.fact_id}: 未知 token_id ${itemDecision.token_id}`);
      if (itemDecision.kind) {
        if (!allowedKinds.has(itemDecision.kind)) throw new Error(`${item.token_id}: kind 非法`);
        if (item.kind_locked && itemDecision.kind !== item.suggested_kind) {
          throw new Error(`${item.token_id}: 计算性质已锁定，不能改 kind`);
        }
        item.kind = itemDecision.kind;
      }
      if (itemDecision.source_id || itemDecision.source_path) {
        const previousSourceId = item.source_id;
        const previousSourcePath = item.source_path;
        const candidate = (item.source_candidates || []).find(value =>
          (itemDecision.source_id && value.source_id === itemDecision.source_id)
          || (itemDecision.source_path && value.source_path === itemDecision.source_path));
        if (!candidate
          && ((itemDecision.source_id && !allowedSourceIds.has(itemDecision.source_id))
            || (itemDecision.source_path && !allowedSourcePaths.has(itemDecision.source_path)))) {
          throw new Error(`${item.token_id}: 来源不在候选或 source-index 中`);
        }
        item.source_id = candidate?.source_id || itemDecision.source_id || null;
        item.source_path = candidate?.source_path || itemDecision.source_path || null;
        item.locator = candidate?.locator || itemDecision.locator || '';
        if (item.source_id !== previousSourceId || item.source_path !== previousSourcePath) {
          item.source_sha256 = null;
          item.mechanical_status = 'unresolved';
          item.matched_numeric_tokens = [];
          item.missing_numeric_tokens = [item.raw];
        }
      }
      if (itemDecision.derivation) {
        const derivation = itemDecision.derivation;
        if (!derivation || typeof derivation !== 'object' || Array.isArray(derivation)
          || !Array.isArray(derivation.operands) || !derivation.operands.length
          || !['add', 'subtract', 'multiply', 'divide', 'inclusive_range_count'].includes(derivation.operator)
          || !Number.isFinite(Number(derivation.displayed_value))) {
          throw new Error(`${item.token_id}: derivation 必须是结构化对象，包含 operands、operator、displayed_value`);
        }
        if (derivation.operand_refs !== undefined && (!Array.isArray(derivation.operand_refs)
          || derivation.operand_refs.length !== derivation.operands.length)) {
          throw new Error(`${item.token_id}: operand_refs 必须与 operands 一一对应`);
        }
        item.derivation = derivation;
      }
    }
  }
  return stored;
}

function nextStepForCurrent(current, copyPath, auditPath, queuePath) {
  const autoConfirmCount = (current.facts || []).filter(autoConfirmable).length;
  const semanticCount = semanticQueue(current.facts || []).length;
  const issues = classifyAuditIssues(current);
  if (autoConfirmCount > 0) {
    return {
      mode: 'confirm',
      reason_zh: `有 ${autoConfirmCount} 条仅含方案数字或非事实编号的低风险项可自动确认。`,
      example: `node audit-final-copy.mjs --mode confirm --copy "${copyPath}" --audit "${auditPath}"`,
    };
  }
  if (semanticCount > 0) {
    return {
      mode: 'resolve',
      reason_zh: `有 ${semanticCount} 条来源事实或高风险语义项需要独立归属核对。只读 ${queuePath} 与其引用的原文片段。`,
      example: `node audit-final-copy.mjs --mode resolve --copy "${copyPath}" --audit "${auditPath}" --decisions <fact-audit-decisions.json>`,
    };
  }
  if (issues.hard_errors.length || issues.human_review_required.length) {
    return {
      mode: 'resolve',
      reason_zh: `仍有 ${issues.hard_errors.length} 条阻断错误和 ${issues.human_review_required.length} 条人工例外，请根据 ${queuePath} 修正文案或决策。`,
      example: `node audit-final-copy.mjs --mode resolve --copy "${copyPath}" --audit "${auditPath}" --decisions <fact-audit-decisions.json>`,
    };
  }
  return {
    mode: 'check',
    reason_zh: '归属核对已完成，运行最终复算后再打开 By-page Review。',
    example: `node audit-final-copy.mjs --mode check --copy "${copyPath}" --audit "${auditPath}"`,
  };
}

const argv = process.argv.slice(2);
const args = argsOf(argv);
const mode = args['--mode'] || (args['--next'] ? 'next' : 'prepare');
activeMode = mode;
if (!argv.length || args['--help']) {
  process.stdout.write(`${JSON.stringify({
    valid: true,
    mode: 'help',
    workflow: ['prepare', 'confirm', 'resolve', 'check'],
    note_zh: 'confirm 只批量确认无外部归属风险的项目；所有来源事实和衍生事实都必须在 resolve 中通过原文片段独立核对。任意阶段可用 --next --audit <path> 查看下一步。',
    modes: MODE_GUIDE,
  }, null, 2)}\n`);
  process.exit(0);
}
if (args['--next']) {
  if (!args['--audit'] || !existsSync(resolve(args['--audit']))) {
    process.stdout.write(`${JSON.stringify({ valid: true, mode: 'next', next: MODE_GUIDE.prepare })}\n`);
    process.exit(0);
  }
  const auditPath = resolve(args['--audit']);
  const stored = JSON.parse(readFileSync(auditPath, 'utf8'));
  const copyPath = resolve(args['--copy'] || stored.copy_path || '');
  if (!existsSync(copyPath)) throw new Error(`无法确定当前文案：${copyPath}；请增加 --copy`);
  const queuePath = args['--queue']
    ? resolve(args['--queue'])
    : resolve(dirname(auditPath), 'fact-audit-review-queue.json');
  const current = buildFromStored(copyPath, auditPath);
  writeReviewQueue(queuePath, current, true);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    mode: 'next',
    summary: summarizeFacts(current.facts),
    next: nextStepForCurrent(current, copyPath, auditPath, queuePath),
    review_queue: queuePath,
  })}\n`);
  process.exit(0);
}
required(args, ['--copy', '--audit']);
const copyPath = resolve(args['--copy']);
const auditPath = resolve(args['--audit']);
const queuePath = args['--queue']
  ? resolve(args['--queue'])
  : resolve(dirname(auditPath), 'fact-audit-review-queue.json');

if (mode === 'prepare') {
  required(args, ['--source-index', '--materials', '--source-root']);
  const sourceIndexPath = resolve(args['--source-index']);
  const materialsPath = resolve(args['--materials']);
  const sourceRoot = resolve(args['--source-root']);
  validatePrepareInputs(copyPath, sourceIndexPath, materialsPath, sourceRoot);
  const current = buildAudit({
    copyPath,
    sourceIndexPath,
    materialsPath,
    sourceRoot,
    previousAuditPath: existsSync(auditPath) ? auditPath : null,
  });
  mkdirSync(dirname(auditPath), { recursive: true });
  writeFileSync(auditPath, `${JSON.stringify(current, null, 2)}\n`);
  const reviewQueue = writeReviewQueue(queuePath, current);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    mode,
    summary: current.summary,
    blocking_queue_count: reviewQueue.blocking_queue.length,
    semantic_review_queue_count: reviewQueue.semantic_review_queue.length,
    output: auditPath,
    review_queue: queuePath,
    next: nextStepForCurrent(current, copyPath, auditPath, queuePath),
  })}\n`);
  process.exit(0);
}

if (mode === 'resolve') {
  required(args, ['--decisions']);
  if (!existsSync(auditPath)) throw new Error(`事实审计不存在：${auditPath}`);
  const stored = JSON.parse(readFileSync(auditPath, 'utf8'));
  const decisions = JSON.parse(readFileSync(resolve(args['--decisions']), 'utf8'));
  writeFileSync(auditPath, `${JSON.stringify(applyDecisions(stored, decisions), null, 2)}\n`);
  const current = buildFromStored(copyPath, auditPath);
  current.summary = summarizeFacts(current.facts);
  writeFileSync(auditPath, `${JSON.stringify(current, null, 2)}\n`);
  const reviewQueue = writeReviewQueue(queuePath, current);
  const issues = classifyAuditIssues(current);
  process.stdout.write(`${JSON.stringify({
    valid: issues.hard_errors.length === 0 && issues.human_review_required.length === 0,
    reviewable: issues.hard_errors.length === 0,
    requires_human_review: issues.human_review_required.length > 0,
    mode,
    summary: current.summary,
    hard_error_count: issues.hard_errors.length,
    human_review_required_count: issues.human_review_required.length,
    remaining_semantic_review_queue_count: reviewQueue.semantic_review_queue.length,
    output: auditPath,
    review_queue: queuePath,
    next: nextStepForCurrent(current, copyPath, auditPath, queuePath),
  })}\n`);
  process.exit(issues.hard_errors.length ? 1 : 0);
}

if (mode === 'confirm') {
  if (!existsSync(auditPath)) throw new Error(`事实审计不存在：${auditPath}`);
  const current = buildFromStored(copyPath, auditPath);
  let confirmed = 0;
  current.facts = current.facts.map(fact => {
    if (!autoConfirmable(fact)) return fact;
    confirmed += 1;
    return provisionalDecision(fact);
  });
  current.summary = summarizeFacts(current.facts);
  writeFileSync(auditPath, `${JSON.stringify(current, null, 2)}\n`);
  const reviewQueue = writeReviewQueue(queuePath, current, true);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    mode,
    confirmed,
    summary: current.summary,
    remaining_attention_count: reviewQueue.blocking_queue.length + reviewQueue.semantic_review_queue.length,
    output: auditPath,
    next: nextStepForCurrent(current, copyPath, auditPath, queuePath),
  })}\n`);
  process.exit(0);
}

if (mode === 'check') {
  if (!existsSync(auditPath)) throw new Error(`事实审计不存在：${auditPath}`);
  const current = buildFromStored(copyPath, auditPath);
  const issues = classifyAuditIssues(current);
  writeReviewQueue(queuePath, current, true);
  process.stdout.write(`${JSON.stringify({
    valid: issues.hard_errors.length === 0 && issues.human_review_required.length === 0,
    reviewable: issues.hard_errors.length === 0,
    requires_human_review: issues.human_review_required.length > 0,
    mode,
    summary: summarizeFacts(current.facts),
    hard_error_count: issues.hard_errors.length,
    human_review_required_count: issues.human_review_required.length,
    review_queue: queuePath,
    next: nextStepForCurrent(current, copyPath, auditPath, queuePath),
  })}\n`);
  process.exit(issues.hard_errors.length ? 1 : 0);
}

throw new Error('--mode 必须为 prepare、resolve、confirm 或 check');
