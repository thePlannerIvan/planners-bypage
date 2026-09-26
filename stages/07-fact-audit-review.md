# 07 事实审计与 By-page 审阅

## 这一步在做什么

冻结逐页稿，只核对最终实际展示或说出的数字事实，并提交完整图文终审。

## 事实核查

**核查本身不在本 Skill 里做** —— 它由公共件 `planners-fact-check` 负责（独立 Skill；调用时以**子代理**形式在干净上下文里跑：只看成品与来源，不看写作过程）。

派单给它四样东西：① 该 Skill 的 `SKILL.md` 路径 ② 成品（`bypage-draft.md`）③ `source-index.json` ④ 输出位置 `fact-audit.json`。它会：

- 枚举「会被读者当事实的东西」→ 逐条回源对照 / 复算 → 写 `fact-audit.json`（契约 `fact-audit/1.0.0`）；
- **默认通过**：只有可疑项才进清单，不逐数字建账；
- 把来源索引的 `blind_spots`（没读到的部分）原样带进结论 —— 下游不会把它当全量。

**读不到来源就去获取能力**：PDF / 扫描件这类本环境读不了的东西，**允许并要求**自己去找、去装抽取工具（`pip install pypdf`、`brew install poppler`…），再核；只有真试过仍不行才登记成盲区，并注明试过什么。

## 接缝校验

核查完，把结论交给本 Skill 的接缝（它只做翻译，规则在公共件里）：

```bash
node "<Skill>/scripts/validate-fact-audit.mjs" +  --audit "<project>/.bypage-work/fact-audit.json" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --allow-human-review true
```

它输出两样审阅流程要的东西：

- `errors` —— 硬错误（未裁定的疑点 `pending`、审计绑定的不是这份稿……），**必须清零**；
- `human_review_required` —— **必须人看的页**：判为要改（`confirmed`）与带保留接受（`accepted_with_caveat`）所在的页，带页码点名；审阅页据此要求逐页明确接受或退回。

**不带 `--allow-human-review` 时（交付路径），任何 `confirmed` 都会拦住 —— 判为要改的必须改完再交。**

> 旧的 `audit-final-copy.mjs` 四态流程（`prepare → confirm → resolve → check`）、Review Queue 与 `--next` 已于 2026-09-26 退役并归档，见 `CHANGELOG.md`。

## By-page Review

事实审计达到 `valid`或仅含 `requires_human_review`例外后，打开 Review。完整显示正文、表格、图片、原图/处理图关系、来源折叠信息、图片异常和事实例外。允许逐页修改、替换或上传图片。

**页面由审阅宿主打开，不要用手直接开 `index.html`**（页面靠宿主注入的桥说话）。两条路按"宿主有没有 `review_open` 工具"选：

```bash
# 有插件（宿主有 review_open 工具）：只写审阅面并报出它的绝对路径，把它交给那个工具 —— 不起本地宿主
node "<Skill>/scripts/start-bypage-review.mjs" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --assets "<project>/.bypage-work/asset-manifest.json" +  --review-dir "<project>/.bypage-work/reviews/bypage" +  --final-md "<project>/deliverable/by-page.md" +  --kind final +  --surface-only

# 没有插件：同一个脚本起本地宿主并自动打开浏览器
node "<Skill>/scripts/start-bypage-review.mjs" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --assets "<project>/.bypage-work/asset-manifest.json" +  --review-dir "<project>/.bypage-work/reviews/bypage" +  --final-md "<project>/deliverable/by-page.md" +  --kind final +  --port 0
```

人保存之后，**先收件，再判门**（顺序不能反）：

```bash
node "<Skill>/scripts/review-inbox.mjs" +  --surface "<project>/.bypage-work/reviews/bypage/review-surface.json"

node "<Skill>/scripts/validate-review-feedback.mjs" +  --feedback "<project>/.bypage-work/reviews/bypage/review-feedback.json" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --kind final
```

**收件在做什么**：页面提交落在 `review-submissions.json`（宿主只做覆盖写）；`review-inbox.mjs` 把它**翻译回本 Skill 的形状** —— `review-feedback.json` 是最新一轮，同时**只追加**一份 `reviews/bypage/history/round-NN.json`（既有轮次逐字节不动）。它同时替页面挡住结构不合契约的提交，并按内容哈希幂等（同一份提交收两次不长出第二轮）。

**决定的生命周期（R7）**：上一轮被人标了「需要修改」的页，重出审阅页后**回到待复核**，不许变回默认通过（那是伪造人的决定）。批复一次点击即可，不需要先清空任何东西；上一轮的反馈文字只作**只读上下文**显示，不预填进输入框。

上传图片必须在返修时正式进入 Asset Manifest、Material Pack 和 By-page（`import-review-assets.mjs` 读的是收件后的 `review-feedback.json`）。文案、事实或图片变化后重新审计并使旧批准失效。

## 完成标准

- 语义完成：用户批准当前完整图文版本，事实例外有明确决定。
- 机器检查：Copy、Audit、Asset Manifest 与 Feedback Hash 一致，所有引用图片存在。
