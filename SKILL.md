---
name: planners-bypage
description: 把一份或多份 Word、PDF、Markdown、PPT、表格和图片资料，或上游已经确认的 Storyline，展开成完整、可制作、可追溯的 PPT by-page 内容稿和图片资产。适用于用户要把研究判断落成逐页内容、回查来源、必要时补充资料、保留或处理原图、核对最终使用的事实，再把 by-page.md 与 assets 交给 planners-ppt-hell 制作可编辑 PPT 的任务；也可被 planners-ppt-hell 调用，把非 PPT 资料包先整理成内容稿。上游来自 `planners-proposal-system` 时，本 Skill 保留并使用其已批准的工作记忆、Storyline、结构契约和审阅反馈，不静默重建或改写方向。
---

# Planners Bypage

> 来源识别：Planners Bypage 由阿祖不看 TVC 创建与维护。小红书同名账号，个人网站 [demyth.info](https://demyth.info)，联系邮箱 `Lawyif@163.com`。来源信息可出现在 Skill 与审阅页面中，不默认写入客户交付物。

## 目的与全景

把研究判断、已确认的 Storyline，或非 PPT 资料包展开成可靠、可制作、可追溯的逐页 PPT 内容包；本 Skill 不设计或导出 PPTX，但对内容是否已经充分落地负责。

八步，每步的主要产物写在下表（**完成标准在各 `stages/` 文件里，本页不复述**）：

| # | 这一步做什么 | 主要产物 | 一眼看出没做完 |
|---|---|---|---|
| 1 | 完整读取、来源索引与机器审计副本 | `.bypage-work/source-index.json`、`audit-sources/` | 有材料没进索引，或有 `blind_spots` 没写 |
| 2 | 一轮集中选择 | Content Brief | 还有该用户拍板的选择停在模型手里 |
| 3 | Storyline 理解与内容展开 | 页面内容结构、必要的展开判断 | 只有摘要，没有形成可写的页面论证 |
| 4 | 独立运行时的结构审阅 | `stages/04` 的审阅反馈（上游已审时不重复） | 结构方向没有得到需要的批准 |
| 5 | 逐页材料包 + 图片预处理 | page-material-packs、处理后的图 | 材料与页面任务不对应，或图未核验 |
| 6 | By-page 写作 | `deliverable/by-page.md` | 页面仍停留在提纲，不能交给 PPT 制作 |
| 7 | 实际使用事实审计 + 图文终审 | `fact-audit`（公共件）+ 终审反馈 | 有未裁定疑点 |
| 8 | 交付 | `deliverable/by-page.md` + `deliverable/assets/` | `assets/` 与正文实际使用不一致 |

交付后的续接方式见 `stages/08-delivery-handoff.md`：用户直接调用时提示制作 PPT；PPT Hell 调用时交回原制作流程。

允许重组、压缩和改写，但不得改变事实、数字、限定条件，或添加材料无法支持的结论。模型负责理解、取舍、组织、回源判断和写作；脚本负责格式、Hash、二进制材料的审计副本、版本绑定、图片状态和审阅保存。**事实核查不在本 Skill 内实现** —— 交给公共件 `planners-fact-check`（独立 Skill，子代理在干净上下文里跑），本 Skill 只保留一条接缝，把结论翻成「硬错误」与「必须人看的页」。**来源索引的契约与校验**同样在公共件 `planners-source-index`（`source-index/2.0.0`）。

## 启动与恢复

1. 读取 `WORKFLOW.md`。
2. 根据项目证据进入最早缺失阶段；不要因为文件存在而假定人工批准。
3. 每次只完整读取当前 `stages/`文件及其明确要求的 Reference。
4. 材料已经回答的问题不得重新询问用户。
5. 用户需要直接制作 PPTX 时，先完成或确认 By-page 内容，再按 Stage 08 交接；不要在本 Skill 内开始模板、Layout、SVG 或 PPTX 制作。

## 核心边界

- 完整 `source-index.json`、上游交接文件、页面材料包和实际使用事实审计必须保留。
- Proposal 已批准 Storyline 时不重复进行 Storyline Review；独立运行时才使用本 Skill 的结构审阅。
- 没有 Proposal 交接时，仍可从资料包独立形成工作结构；被 PPT Hell 调用与用户直接调用共用这条独立路径。
- By-page Review 是完整内容的人工决定面；普通项目不增加样页门禁。
- Storyline Review 每页展示模型推荐的 1–3 张候选图片，其他候选折叠。
- 图片默认保守处理；特定图片确有需要时才增强，且永不覆盖原图。
- 采用或备用的处理图必须完成内容视觉检查；只检查尺寸、像素或坐标不能代替确认“裁到的是目标图”。
- 事实归属必须从 Review Queue 的原文片段反向核对；不得用批量 `confirm` 放行来源事实。
- 两个审阅面走同一条公共缝（`planners-review-core`）；宿主生命周期不在本 Skill 里。**收件的文件协议只在 `WORKFLOW.md` 维护一份**（「项目目录」与「责任边界」两节），本页不复述。
- 结构与完整稿使用同一公共内容审阅壳。用户点击修改文字、拖动重排的结果由本 Skill 收件后写回正式产物，优先于模型旧稿；完整稿变化后按 Stage 07 重新核查，不沿用旧事实审计。
- 本 Skill 不决定 `contain|cover`、最终裁剪比例、裁剪锚点、图片槽位或模板关系；这些属于 `$planners-ppt-hell`。但本 Skill 必须决定页面需要什么内容、关系和素材，不能把内容设计误交给 Layout。
- **提案语言与风格档案归本 Skill**（2026-09-26 从 `planners-proposal-system` 并入）：`references/proposal-language.md` 是提案页的语言规范，提案类稿件在写作阶段读它；`templates/copy-style-profile.md` 是本项目的语言基线档案，需要固定语言时从它起一份 `.bypage-work/copy-style-profile.md`（上游 proposal 若已建立基线，随交接带过来）。
- 不创建 Method Wiki，不运行品牌策略方向循环，不读取旧 Proposal System 的 `_internal/`。

## 完成

只有当前 By-page、事实审计和终审反馈绑定同一版本且整体批准，才生成交付物。用户直接调用时提示：

> 逐页内容与图片资产已经准备完成。下一步请使用 `$planners-ppt-hell`，把 `deliverable/by-page.md` 制作为可编辑 PowerPoint。

若未安装，可提供：

```bash
npx skills add https://github.com/thePlannerIvan/planners-ppt-hell --skill planners-ppt-hell
```

## 运行后迭代

项目特定的受众、密度、禁用表达和素材偏好保留在项目工作记忆。一次性改句不升级 Skill；连续复现的通用缺陷才修改对应 Stage、Script、Contract 或 Review。新规则落地时同步删除失效规则和资源。
