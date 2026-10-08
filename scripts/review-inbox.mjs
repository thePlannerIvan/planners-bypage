#!/usr/bin/env node
/**
 * 收件：把审阅面提交的那**一份**文件，翻译回本 Skill 自己的存储形状。
 *
 * ## 为什么需要这一层
 *
 * 缝的 `write` 是**覆盖写一份文件**。本 Skill 的存储形状不是那样，它是：
 *
 *   · `review-feedback.json` —— **当前最新一轮**（agent 与所有 Validator 读的就是它）；
 *   · `history/round-NN.json` —— **每一轮都留一份，只追加，永不覆盖**。
 *
 * 形状对不上时不改本 Skill 的形状（那是对外语义）：surface 声明一份提交文件，
 * 这里收件时翻译。零改动的清单：feedback 的字段与取值、决定词表、事实例外机制、
 * `history/round-NN.json` 的编号与不覆盖规则、agent 读的那条路径 —— 一个都没动。
 *
 * ## 幂等：靠提交内容的哈希，不往记录里加字段
 *
 * 同一次提交被收两次（人重复点、或模型跑了两遍收件）→ 第二次是空操作；
 * 人真的又提交了一次内容完全一样的东西 → 也当空操作（同一份决定重复保存没有新信息）。
 * 哈希记在 `<审阅目录>/.inbox-cursor.json`，**不写进反馈文件**（那会改形状）。
 *
 * ## 顺手把"上一条最新"也收进历史
 *
 * 旧流程里这件事由 launcher 在**重出审阅页**时做（归档 + 删）。现在写盘的人是宿主，
 * 所以在收件这一步补上：先把还没进历史的 `review-feedback.json` 追加成一轮，再写新的。
 * 既有历史文件**逐字节不动**。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { FEEDBACK_REL, HISTORY_DIR, resolveSurfacePaths, surfacePath } from './review-surface.mjs';
import {contentHash,prepareEdits,commitEdits} from './lib/review-edits.mjs';

const CURSOR_NAME = '.inbox-cursor.json';
const ALLOWED_CONTRACT = '1.1.0';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function rounds(historyDir) {
  if (!existsSync(historyDir)) return [];
  return readdirSync(historyDir)
    .map(name => ({ name, match: name.match(/^round-(\d+)\.json$/) }))
    .filter(item => item.match)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
}

/** 追加一轮：内容与最后一轮相同就不重复写（旧实现同款判据，一字未改）。 */
function appendRound(historyDir, serialized) {
  mkdirSync(historyDir, { recursive: true });
  const existing = rounds(historyDir);
  const last = existing.at(-1);
  if (last && readFileSync(join(historyDir, last.name), 'utf8') === serialized) {
    return { path: join(historyDir, last.name), written: false };
  }
  const round = last ? Number(last.match[1]) + 1 : 1;
  const path = join(historyDir, `round-${String(round).padStart(2, '0')}.json`);
  writeFileSync(path, serialized);
  return { path, written: true };
}

/** 服务器当年替页面挡的那道结构检查 —— 现在归收件层（宿主不解释形状，谁来替它挡）。 */
export function submissionProblems(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['提交不是对象'];
  if (doc.contract_version !== ALLOWED_CONTRACT) problems.push(`contract_version 必须是 ${ALLOWED_CONTRACT}，实际 ${JSON.stringify(doc.contract_version)}`);
  if (typeof doc.review_kind !== 'string' || !doc.review_kind) problems.push('review_kind 必须是字符串');
  if (!/^[a-f0-9]{64}$/.test(doc.source_sha256 || '')) problems.push('source_sha256 必须是 64 位小写十六进制');
  if (!['approve', 'revise'].includes(doc.overall_decision)) problems.push('overall_decision 只能是 approve 或 revise');
  if (typeof doc.saved_at !== 'string' || !doc.saved_at) problems.push('saved_at 必须是字符串');
  if (!Array.isArray(doc.decisions) || doc.decisions.length === 0) problems.push('decisions 必须是非空数组');
  for (const item of doc.decisions || []) {
    if (!item || typeof item !== 'object') { problems.push('decisions 里有非对象'); continue; }
    if (!Number.isInteger(item.page_number)) problems.push('page_number 必须是整数');
    if (!['approve', 'revise'].includes(item.decision)) problems.push(`第 ${item.page_number} 页的 decision 无效`);
    if (typeof item.feedback_zh !== 'string') problems.push(`第 ${item.page_number} 页的 feedback_zh 必须是字符串`);
    if (item.attachments !== undefined && (!Array.isArray(item.attachments)
      || item.attachments.some(asset => !asset || typeof asset.path !== 'string' || typeof asset.alt !== 'string' || typeof asset.caption !== 'string'))) {
      problems.push(`第 ${item.page_number} 页的 attachments 形状无效`);
    }
  }
  return problems;
}

export function importSubmissions(surfaceFile, { dryRun = false } = {}) {
  const paths = resolveSurfacePaths(surfaceFile);
  const reviewDir = paths.dir;
  const receipt = {
    ok: true,
    surface: paths.surface,
    review_dir: reviewDir,
    submissions: paths.submissions,
    feedback: join(reviewDir, FEEDBACK_REL),
    history: join(reviewDir, HISTORY_DIR),
    imported: null,
    archived_previous: null,
    skipped: null,
    rejected: [],
    dry_run: dryRun,
  };
  if (!paths.submissions || !existsSync(paths.submissions)) {
    receipt.skipped = '还没有提交：' + String(paths.submissions);
    receipt.next_action_zh = '人还没在审阅页上保存（或宿主还没落盘）。';
    return receipt;
  }
  let submission;
  try {
    submission = readJson(paths.submissions);
  } catch (error) {
    receipt.ok = false;
    receipt.rejected.push('提交文件不是合法 JSON：' + error.message);
    receipt.next_action_zh = '提交文件坏了：别继续，先看审阅页/宿主日志。';
    return receipt;
  }
  // R5b：页面报上来的"前提/免责"（这里是"没做版本核对"）**留在收据里**给模型看，
  // 但**不写进原生记录** —— 原生反馈文件的形状与字段一个都不许变。
  if (submission.pre_check === false) {
    receipt.pre_check = false;
    receipt.pre_check_note = String(submission.pre_check_note || '提交方声明：没有经过版本前置核对。');
  }
  const problems = submissionProblems(submission);
  if (problems.length) {
    receipt.ok = false;
    receipt.rejected.push(...problems);
    receipt.next_action_zh = '这份提交没被收下（形状不合本 Skill 的契约）—— 上面每条都说明哪里不对。';
    return receipt;
  }

  const cursorPath = join(reviewDir, CURSOR_NAME);
  const cursor = existsSync(cursorPath) ? readJson(cursorPath) : { imported: [] };
  const digest = contentHash(submission);
  if ((cursor.imported || []).includes(digest)) {
    receipt.skipped = '这份提交已经收过（内容哈希相同）';
    receipt.next_action_zh = '没有新东西可收。';
    return receipt;
  }
  let prepared;
  try { prepared = prepareEdits(submission,reviewDir); }
  catch (error) { receipt.ok = false; receipt.rejected.push(error.message); receipt.next_action_zh = '提交和草稿仍在；先核对原文与用户修改，不得覆盖或沿用旧批准。'; return receipt; }
  if (dryRun) {
    receipt.imported = { hash: digest, dry_run: true };
    receipt.next_action_zh = '--dry-run：只说会收哪一份，没写任何文件。';
    return receipt;
  }

  const historyDir = join(reviewDir, HISTORY_DIR);
  const latestPath = join(reviewDir, FEEDBACK_REL);
  // ① 还没进历史的"当前最新"先追加成一轮（旧 launcher 在重出审阅页时做的同一件事）
  if (existsSync(latestPath)) {
    const archived = appendRound(historyDir, readFileSync(latestPath, 'utf8'));
    receipt.archived_previous = { path: archived.path, written: archived.written };
  }
  // ② 这一份提交 → 本轮 + 当前最新
  // 原生形状：把提交层自己的字段摘掉（pre_check / pre_check_note 不是本 Skill 的反馈字段）
  const native = { ...submission };
  delete native.pre_check;
  delete native.pre_check_note;
  delete native.review_changes;
  if (prepared) {
    native.source_sha256 = prepared.sourceHash;
    native.decisions = native.decisions.map(d => ({...d,page_number:prepared.mapping.get(d.page_number)})).sort((a,b) => a.page_number-b.page_number);
    commitEdits(prepared,reviewDir);
    cursor.applied_draft = contentHash({edits:prepared.changes.edits,page_order:prepared.changes.page_order,section_order:prepared.changes.section_order});
    receipt.content_changed = prepared.changed;
    receipt.page_mapping = Object.fromEntries(prepared.mapping);
    receipt.requires_fact_recheck = prepared.changed && prepared.context.type === 'copy';
  }
  const serialized = JSON.stringify(native, null, 2) + '\n';
  const round = appendRound(historyDir, serialized);
  writeFileSync(latestPath, serialized, 'utf8');
  receipt.imported = {
    hash: digest,
    review_kind: submission.review_kind,
    overall_decision: submission.overall_decision,
    pages: submission.decisions.length,
    round: relative(reviewDir, round.path).split('\\').join('/'),
    round_written: round.written,
    latest: relative(reviewDir, latestPath).split('\\').join('/'),
  };
  cursor.imported = [...(cursor.imported || []), digest].slice(-200);
  cursor.updated_at = new Date().toISOString();
  writeFileSync(cursorPath, JSON.stringify(cursor, null, 2) + '\n', 'utf8');
  // 收件之后走哪一步**按面给**：两个面各有自己的 validator 与阶段文档。
  // （这里曾经写死成逐页面的 stages/07 —— storyline 的提交会被指到错的东西上。）
  const NEXT_STEP = {
    bypage: { validator: 'scripts/validate-review-feedback.mjs', doc: 'SKILL.md 的核查与完整图文审阅', units: '页' },
    bypage_sample: { validator: 'scripts/validate-review-feedback.mjs', doc: 'SKILL.md 的核查与完整图文审阅', units: '页' },
    by_page_copy: { validator: 'scripts/validate-review-feedback.mjs', doc: 'SKILL.md 的核查与完整图文审阅', units: '页' },
    by_page_sample: { validator: 'scripts/validate-review-feedback.mjs', doc: 'SKILL.md 的核查与完整图文审阅', units: '页' },
    storyline: { validator: 'scripts/validate-storyline-review-feedback.mjs', doc: 'SKILL.md 的接手与理解（旧结构审阅续接）', units: '页结构' },
  };
  const next = NEXT_STEP[submission.review_kind] || null;
  receipt.units = { count: Array.isArray(submission.decisions) ? submission.decisions.length : 0,
    label: next ? next.units : '单元' };
  receipt.next_action_zh = next
    ? '收件完成：接着跑 ' + next.validator + '（它才是"算不算门"的判据），然后按 ' + next.doc + ' 处理修改项。'
    : '收件完成：这份提交的 review_kind 是 ' + String(submission.review_kind)
      + '，不在本 Skill 认识的两个面里（bypage / storyline）—— 上面每一条都说明字段对不对，先确认它该不该由这一步收。';
  if (receipt.requires_fact_recheck) receipt.next_action_zh = '用户文字和页序已写回正式稿。旧事实审计已失效；按新稿重新核查并审阅后再交付，不得还原用户修改。页码对应见 page_mapping。';
  return receipt;
}

export function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i]] = argv[i + 1];
  const surfaceFile = args['--surface']
    ? resolve(args['--surface'])
    : args['--review-dir'] ? surfacePath(resolve(args['--review-dir'])) : null;
  if (!surfaceFile) {
    process.stdout.write(JSON.stringify({ ok: false, error: '用法：review-inbox.mjs --surface <review-surface.json> [--dry-run]' }) + '\n');
    return 2;
  }
  if (!existsSync(surfaceFile)) {
    process.stdout.write(JSON.stringify({ ok: false, error: '找不到 surface：' + surfaceFile }) + '\n');
    return 2;
  }
  const receipt = importSubmissions(surfaceFile, { dryRun: argv.includes('--dry-run') });
  process.stdout.write(JSON.stringify(receipt, null, 1) + '\n');
  return receipt.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(process.argv[1]) && process.argv[1].endsWith('review-inbox.mjs')) {
  process.exit(main());
}
