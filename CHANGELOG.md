## 2026-09-26 — Storyline 结构面验收（缝）＋ 收件收据按面给下一步

- **Storyline 面上缝兑现**：入口早已在缝上（surface + 模组 Node 宿主 + `--surface-only`），这一轮补的是**验收**：
  真项目《Adidas vs Nike 世界杯》的真架构（20 页真文本、7 章）机械映射进 `page-architecture/1.0.0`
  （`claim→main_message`、`evidence_needs→source_needs`、`cognitive_job→audience_shift` 原样搬；`page_type` 与素材候选是**推导**，报告里已报备）
  ＋ 真素材（两张真海报）→ 四轮真页面端到端（20 单元 / 20 导航 / 进度条 / **零 console 报错**）→ 收件 → validator `valid: true` → 停干净。
- **修**：`review-inbox.mjs` 的收据把"下一份该读的文档"写死成逐页面的 `stages/07`，storyline 的提交会被指错
  → 改成**按 `review_kind` 给**（storyline → `validate-storyline-review-feedback.mjs` + `stages/04`；bypage → `validate-review-feedback.mjs` + `stages/07`），
  并加 `units {count,label}`。
- **判据**：`evals/review/run.mjs` 加 7 条 —— 收据按面（两个面各一条）、页面"没有桥也把自己画出来"（node vm + 记账 DOM + `localStorage` 一碰就抛）、
  进度条、**反面对照（握手永不返回仍完整）**、渲染排在第一个 `await` 之前。46 → **53** 条断言，5/5 套件全过。
- **红/绿**：只把 `boot()` 退回旧写法（渲染挂在握手后面）→ 红在「反面对照：握手永不返回时页面仍然必须完整画出来」；
  不修收据 → 红在「storyline 的收件收据必须指 storyline 自己的下一步」。

## 2026-09-26 — 修「审阅页把渲染挂在握手上」

- **现象**（与 video-idea 同一次排查）：插件路径下页面只剩静态骨架 —— 页面把 `render()` 排在
  `await ReviewBridge.connect()` 之后，而那个 `try/catch` **只接得住拒绝、接不住不返回**（桥只发一次 hello，
  父帧监听装晚了这条就丢了）。
- **修**：`render()` + `updateProgress()` 先跑（用自己的数据把自己画出来），再去连桥；`connect()` 走
  `connectWithTimeout(1500)`；连不上就把「本页只读」写进 `#saveStatus` 与 `#message`。
- **判据**：`evals/review/run.mjs` 加 4 条守卫（渲染在第一个 await 之前 / 握手必须有超时 / 连不上要出声 /
  不许裸用 localStorage）。5/5 套件仍绿；只把 boot 退回旧写法的副本在这一条上红。
- **证据**：`.scratch/video-idea-seam/tools/plugin_handshake_harness.py`（init：20 页 + 资产走桥；no-init：20 页 + 只读提示）。

## 2026-09-26 — 1.4.0（审阅面上公共缝；修掉"重出审阅页伪造人的决定"）

**起因**：本 Skill 自带一套审阅宿主（`review-session.mjs` + `review-launcher.mjs`，起服务/落盘/归档轮次全在自己手里）。公共缝（`planners-review-core`）已经把宿主收走了，逐页面先接上去。

- **接缝**：新增 `scripts/review-surface.mjs`（surface 文档：`dir` 就是审阅目录，被 serve 的树最小）、`scripts/review-inbox.mjs`（收件：把宿主落盘的 `review-submissions.json` 翻译成 `review-feedback.json` + **只追加** `history/round-NN.json`，按内容哈希幂等）。生命周期一行不写：`review-host.mjs`（Node CLI，模组唯一一份）import 即用。
- **删掉自带宿主**：`scripts/review/review-session.mjs`、`scripts/review/review-launcher.mjs`。页面**不再自带服务器、不改形状**：只留一个裸的 `{{REVIEW_BRIDGE}}` 注入点，资产与上传都走桥。
- **修一个会伪造人决定的坑（R7）**：页面原来把所有非事实例外的页预设成 `approve`，于是"人标了需要修改 → 模型改完重出审阅页 → 人只写了句整体意见就保存"会让那一页**静默变回通过**。现在：上一轮被判 `revise` 的页在下一轮**没有默认值**（必须复核后明确选择，一次点击即可，不需要清空任何东西），上一轮的反馈只作只读上下文；同类第二处一并修掉——人上一轮选的**图片状态**不再被生成器的候选分组覆盖。
- **修上传路径的双基准**：带 `--final-md` 时上传返回的 `markdown_path` 是相对 deliverable 的，而收件方相对 feedback 文件解析它 → 上传的图必然收不进 Asset Manifest。现在只回一个相对基准的路径。
- **测试**：审阅套件迁到缝上（提交走宿主的 `/__review/write`，再收件；清理由模组 `stopHost` 负责），另加三条钉子：`--surface-only` **一次 start 都不发生**、起→停不留进程不留端口、注入点是裸标记独占一行。基线 46 条断言 → 63 条，5/5 套件绿；每条新断言在修正前的代码上都红。

# Changelog

## 2026-09-26 — 1.3.0（事实核查与来源索引交给公共件）

**起因**：本项目与 `planners-proposal-system` 各带一份同源的事实审计器（1066 / 1013 行），来源索引也有四家四种形态。同一条链上两份实现各自演化，就是缺陷的来源。

- **退役** `scripts/lib/final-fact-audit.mjs`（1066 行）与 `scripts/audit-final-copy.mjs`（509 行）：逐数字建账、逐条独立归属核对、哈希三方互绑，是「无法整段对照」的年代为「保证不漏」付的成本。原件归档到 `02-skills-library/_archive/bypage-fact-audit-retired-2026-09-26/`。
- **改调** `planners-fact-check`（独立 Skill，子代理在干净上下文里跑）：产出 `fact-audit/1.0.0` —— **只有可疑项、默认通过**；有未裁定的疑点不放行；「判为要改」必须改完再交。
- `scripts/validate-fact-audit.mjs` 变成**接缝**：把公共件的结论翻成 `errors`（硬错误）与 `human_review_required`（判为要改 / 带保留接受的页，带页码）。
- **来源索引**改用 `planners-source-index` 的 `source-index/2.0.0`：本 Skill 的契约副本已删（不再有第二个真相源），`scripts/validate-source-index.mjs` 变成 19 行薄壳，`scripts/lib/planners-modules.mjs` 是「按名字找兄弟目录」的解析适配器。
- **证据**：两组自编漂移测试 + 一次真实案例回放 —— 在真实 wiki 概念页里找出一处硬错（−8.4 应为 −7.6）且零误报。判据见 `.scratch/planner-skill-decomposition/research/fact-check-real-replay.md`。

## 1.2.0 — 2026-08-04

### Added

- 事实审计 CLI 的 `--help` 与状态感知 `--next`，包含完整参数模板。
- 来源反推的独立归属队列，逐数字展示机器命中的原文片段。
- Storyline 与 By-page 反馈的 `history/round-NN.json` 轮次留档。
- 无原生视觉、未知 Python 环境和多语言临时脚本的降级指引。

### Changed

- `confirm` 只自动确认方案数字和非事实编号；来源/衍生事实必须经过 `resolve` 独立核对。
- 审计策略升级为 `source-first-attribution/1.2.0`，旧语义批准会自动失效并要求重查。

### Fixed

- 行首列表编号导致同句后续事实数字被误标为 `non_factual`。
- 历史性“从 A 提升到 B”和“增长 C”在没有目标/建议语气时被误标为 `planned_value`。
- `confirm`/`--next` 将待归属事实错误降级为无独立检查清单的阻断项。

## 1.1.0 — 2026-08-03

- 首个公开版本。
- 包含 Source Index 1.1、二进制文档审计副本、图片视觉门禁、两轮 HTML Review、事实审计和 `planners-ppt-hell` 交付衔接。
