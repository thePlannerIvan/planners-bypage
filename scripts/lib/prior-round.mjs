#!/usr/bin/env node
/**
 * 上一轮**人**做过的决定 —— 审阅页重出时唯一该被带回来的东西。
 *
 * ## 为什么要有这个文件（这条是被一个真实的坑逼出来的）
 *
 * 审阅页每次重出都是一张新页面，页面自己不知道上一轮人说过什么。原实现里，
 * 非事实例外的页在页面初始化时**一律预设成 approve**：
 *
 *     const decisions = new Map(REVIEW.pages.filter(p => !p.requires_fact_decision)
 *       .map(p => [p.page_number, 'approve']));
 *
 * 于是「人标了需要修改 → 模型改完重出审阅页 → 人只写了句整体意见就保存」这条路里，
 * 那一页会**静默地变回通过** —— 不是要人清理，而是**直接伪造了人的决定**（R7）。
 *
 * 修法：把上一轮的决定读回来，交给页面当**只读上下文 + 预设依据**：
 *   · 上一轮被判"需要修改"的页 → 本轮**没有默认值**，必须由人重新明确选择（一次点击就能通过）；
 *   · 上一轮人选过的图片状态 → 本轮按 asset_id 还原，不被生成器的候选分组覆盖；
 *   · 上一轮的意见文字 → 只作只读上下文，**绝不预填进输入框**（预填＝本轮多出一条假待办）。
 *
 * ## 两条判据
 *
 * 1. **只在同一面之间带**（`review_kind` 必须相同）。sample 轮的决定不能泄进 final 轮。
 * 2. **读不到就当第一轮**（文件不存在、JSON 坏了、版本对不上）。不猜、不合成。
 */
import { existsSync, readFileSync } from 'node:fs';

/** 与本 Skill 的 feedback 契约同名的一份最小读取器；只读它认识的字段，不校验（校验归 Validator）。 */
export function readPriorRound(feedbackPath, expectedKind) {
  if (!feedbackPath || !existsSync(feedbackPath)) return null;
  let doc;
  try {
    doc = JSON.parse(readFileSync(feedbackPath, 'utf8'));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') return null;
  // 判据 1：不同面之间不带。sample 的逐页决定与 final 的页集含义不同。
  if (expectedKind && doc.review_kind !== expectedKind) return null;
  if (!Array.isArray(doc.decisions)) return null;
  const byPage = new Map();
  for (const item of doc.decisions) {
    const page = Number(item?.page_number);
    if (!Number.isInteger(page)) continue;
    byPage.set(page, {
      decision: item.decision,
      feedback_zh: typeof item.feedback_zh === 'string' ? item.feedback_zh : '',
      fact_exception_decision: item.fact_exception_decision ?? null,
      asset_decisions: Array.isArray(item.asset_decisions)
        ? item.asset_decisions
          .filter(entry => entry && typeof entry.asset_id === 'string' && typeof entry.status === 'string')
          .map(entry => ({ asset_id: entry.asset_id, status: entry.status }))
        : [],
      attachments: Array.isArray(item.attachments) ? item.attachments : [],
    });
  }
  return {
    review_kind: doc.review_kind,
    saved_at: typeof doc.saved_at === 'string' ? doc.saved_at : null,
    overall_decision: doc.overall_decision ?? null,
    overall_feedback_zh: typeof doc.overall_feedback_zh === 'string' ? doc.overall_feedback_zh : '',
    byPage,
  };
}

/**
 * 一页的"上一轮"信息 → 页面要的三件事。
 *
 * **字段名必须与页面读的那几个字一模一样**（`default_decision` / `requires_recheck` / `prior`）——
 * 这里曾经写成 camelCase，页面读 `page.default_decision` 读到 undefined，
 * 于是**每一页都变成"必须人选"**，第一轮就保存不了。名字只在这一处定义，页面只读不猜。
 *
 * `default_decision` 是**唯一**决定"这页默认通过还是必须人选"的地方：
 *   · 事实例外页 → null（本 Skill 原有语义：必须逐页明确接受或退回，一个字没改）；
 *   · 上一轮被判"需要修改"→ null（本轮必须复核后明确选择；一次点击即可通过，无需清理）；
 *   · 其余 → 'approve'（本 Skill 原有语义：全部页面默认通过）。
 */
export function pageDefaults(prior, requiresFactDecision) {
  const wasRevise = prior?.decision === 'revise';
  return {
    default_decision: requiresFactDecision || wasRevise ? null : 'approve',
    requires_recheck: wasRevise,
    prior: prior
      ? {
        decision: prior.decision ?? null,
        feedback_zh: prior.feedback_zh,
        fact_exception_decision: prior.fact_exception_decision,
        asset_decisions: prior.asset_decisions,
      }
      : null,
  };
}

/** 图片候选的初值：人上一轮选过就用人的，没选过才用生成器的候选分组。 */
export function seedAssetDecisions(candidates, prior) {
  const chosen = new Map((prior?.asset_decisions || []).map(entry => [entry.asset_id, entry.status]));
  return (candidates || []).map(asset => ({
    asset_id: asset.asset_id,
    status: chosen.get(asset.asset_id) || asset.status || 'backup',
    // 这一格是不是"人上一轮定的"——页面据此说明，不许把生成器的分组说成人的决定。
    from_prior_round: chosen.has(asset.asset_id),
  }));
}
