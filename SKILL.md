---
name: planners-bypage
description: 把一份或多份 Word、PDF、Markdown、PPT、表格和图片资料可靠地整理成经过 Storyline 与逐页审阅的 PPT by-page 内容稿和图片资产。适用于用户要先筛选多源材料、确认叙事结构、逐页回查来源、保留或处理原图、核对最终使用的数字事实，再把 by-page.md 与 assets 交给 planners-ppt-hell 制作可编辑 PPT 的任务。它同时是**提案逐页文案的产线**：`planners-proposal-system` 交出已批准的 Page Architecture 之后，逐页文案、语言、事实核查与终稿都由本 Skill 完成。
---

# Planners Bypage

> 来源识别：Planners Bypage 由阿祖不看 TVC 创建与维护。小红书同名账号，个人网站 [demyth.info](https://demyth.info)，联系邮箱 `Lawyif@163.com`。来源信息可出现在 Skill 与审阅页面中，不默认写入客户交付物。

## 目的与全景

把多源材料变成可靠、可制作、可追溯的逐页 PPT 内容包；本 Skill 不设计或导出 PPTX。

```text
完整读取、来源索引与机器审计副本
→ 一轮集中选择
→ Storyline + Page Architecture
→ 图文结构审阅
→ 逐页材料包 + 图片预处理
→ By-page 写作
→ 实际使用事实审计 + 图文终审
→ deliverable/by-page.md + deliverable/assets/
→ $planners-ppt-hell
```

允许重组、压缩和改写，但不得改变事实、数字、限定条件，或添加材料无法支持的结论。模型负责理解、取舍、组织、回源判断和写作；脚本负责格式、Hash、二进制材料的审计副本、版本绑定、图片状态和审阅保存。**事实核查不在本 Skill 内实现** —— 交给公共件 `planners-fact-check`（独立 Skill，子代理在干净上下文里跑），本 Skill 只保留一条接缝，把结论翻成「硬错误」与「必须人看的页」。**来源索引的契约与校验**同样在公共件 `planners-source-index`（`source-index/2.0.0`）。

## 启动与恢复

1. 读取 `WORKFLOW.md`。
2. 根据项目证据进入最早缺失阶段；不要因为文件存在而假定人工批准。
3. 每次只完整读取当前 `stages/`文件及其明确要求的 Reference。
4. 材料已经回答的问题不得重新询问用户。
5. 用户需要直接制作 PPTX 时，先完成或确认 By-page 内容，再提示调用 `$planners-ppt-hell`；不要在本 Skill 内开始模板、Layout、SVG 或 PPTX 制作。

## 核心边界

- 完整 `source-index.json`、页面材料包和实际使用事实审计必须保留。
- 集中选择、Storyline Review、By-page Review 是三个人工决定面；普通项目不增加样页门禁。
- Storyline Review 每页展示模型推荐的 1–3 张候选图片，其他候选折叠。
- 图片默认保守处理；特定图片确有需要时才增强，且永不覆盖原图。
- 采用或备用的处理图必须完成内容视觉检查；只检查尺寸、像素或坐标不能代替确认“裁到的是目标图”。
- 事实归属必须从 Review Queue 的原文片段反向核对；不得用批量 `confirm` 放行来源事实。
- 两个审阅面走同一条公共缝（`planners-review-core`）：宿主落盘 `review-submissions.json`，`scripts/review-inbox.mjs` 收件后翻译成 `review-feedback.json`（最新版）并**只追加** `history/round-NN.json`；Host 生命周期不在本 Skill 里，`--surface-only` 交给有插件宿主。
- 本 Skill 不决定 `contain|cover`、最终裁剪比例、裁剪锚点、图片槽位或模板关系；这些属于 `$planners-ppt-hell`。
- **提案语言与风格档案归本 Skill**（2026-09-26 从 `planners-proposal-system` 并入）：`references/proposal-language.md` 是提案页的语言规范，提案类稿件在写作阶段读它；`templates/copy-style-profile.md` 是本项目的语言基线档案，需要固定语言时从它起一份 `.bypage-work/copy-style-profile.md`（上游 proposal 若已建立基线，随交接带过来）。
- 不创建 Method Wiki，不运行品牌策略方向循环，不读取旧 Proposal System 的 `_internal/`。

## 完成

只有当前 By-page、事实审计和终审反馈绑定同一版本且整体批准，才生成交付物。完成后明确告诉用户：

> 逐页内容与图片资产已经准备完成。下一步请使用 `$planners-ppt-hell`，把 `deliverable/by-page.md` 制作为可编辑 PowerPoint。

若未安装，可提供：

```bash
npx skills add https://github.com/thePlannerIvan/planners-ppt-hell --skill planners-ppt-hell
```

## 运行后迭代

项目特定的受众、密度、禁用表达和素材偏好保留在项目工作记忆。一次性改句不升级 Skill；连续复现的通用缺陷才修改对应 Stage、Script、Contract 或 Review。新规则落地时同步删除失效规则和资源。
