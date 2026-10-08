---
name: planners-bypage
description: 将已确认的 Storyline 展开为完整逐页内容，或将多源资料组织成页面；核查事实、完成图文审阅，交付 By-page 与图片资产。接收 planners-proposal-system 的主线交接，也供 planners-ppt-hell 在制作前调用以整理资料。
---

# Planners Bypage

> 由阿祖不看 TVC 创建与维护。个人网站 [demyth.info](https://demyth.info)，联系邮箱 `Lawyif@163.com`。来源信息不默认写入客户交付物。

## 目的与流程

把判断发展成观众能理解、讲述者能讲、PPT 制作者能继续制作的完整页面。Bypage 负责内容与素材的充分展开，PPT Hell 负责版式、模板、最终裁剪和 PPTX。

```text
接手与理解 → 页面展开与取材 → 完整逐页稿 → 核查与图文审阅 ↔ 修改 → PPT 交接
```

阅读、取材和写作可以往返，沿用已有成果与用户决定。直接审阅完整 By-page，不设置常规的 Storyline Review 或样页审批。

下文 `<Skill>` 是当前 Bypage 目录，`<Project>` 是项目目录，`<W>` 是 `<Project>/.bypage-work`，`<I>` 是本项目权威来源索引的绝对路径。按名称找到当前环境里的依赖；公共模组由 `scripts/lib/planners-modules.mjs` 解析，缺失时遵循回执与环境权限处理。

## 1. 接手与理解

接收 Proposal、PPT Hell 或恢复既有项目时，读取 `references/content-handoff.md`，按其中的文件归属和调用时机续接。

**Proposal 交接：**读取上游项目记忆、来源索引、`page-architecture.json` 和结构审阅反馈。确认反馈批准且绑定当前上游结构，提取核心判断、必要内容、证据边界与可展开空间。已有 Storyline 直接展开；会改变已确认判断或承诺的问题，带着证据交给用户决定。

**PPT Hell 调用或用户直接提供资料：**接收原始资料、已有目标与用户确认、可用素材和工作目录。使用对应文件能力读取正文、数据与视觉内容，组织适合受众的工作主线。PPT Hell 已有制作项目时保留其目录和续接位置；已有批准的完整 By-page 时直接交回制作，无需重走内容流程。

两条入口共用后续步骤。材料已经回答的问题继续沿用，只询问会实质改变方案而尚未决定的事项。

### 活动文件与归属

在项目记忆中记录以下活动文件的绝对路径、调用方及制作续接位置；后续命令都使用这些路径。`<W>` 是新建时的默认位置，恢复项目时以记忆中的实际位置为准。下文 `<K>` 为材料包、`<V>` 为资产清单、`<D>` 为正式稿、`<F>` 为核查结果、`<R>` 为完整稿审阅目录。

| 文件 | 有 Proposal | 无 Proposal / PPT Hell 资料入口 |
|---|---|---|
| 项目记忆 `<M>` | 沿用上游 `project-memory.md`，追加页面决定 | 沿用同项目记忆；没有才新建 `<W>/project-memory.md` |
| 来源索引 `<I>` | 沿用上游索引原路径和来源 ID | 沿用同项目索引；没有才新建 `<W>/source-index.json` |
| 上游结构与批准反馈 | 保留原件及路径，作为已批准判断的依据 | 沿用已有决定；不存在时直接组织工作结构 |
| 页面工作结构 `<A>` | 首次将上游结构转换为 `<W>/page-architecture.json`；已有则继续维护 | 沿用已有工作结构；没有按模板新建 |
| `<K>`、`<V>`、`<D>`、`<F>`、`<R>` | 沿用同项目的活动文件；缺失项依次在 `<W>` 新建 `page-material-packs.json`、`asset-manifest.json`、`bypage-draft.md`、`fact-audit.json`、`reviews/bypage/` | 同左 |

页面工作结构可拆合页，上游批准结构保持原样。索引和记忆不在 `.bypage-work` 再建副本；来源补读、图片登记、核查、反馈收件和下游回查都指向同一活动文件。正式稿始终为 `<D>`，收件修改原地回写；交付版是由它生成的制作快照，不是第二份可独立返修的稿。

### 来源索引

先读取 `planners-source-index` 入口，字段以其 `contracts/source-index.schema.json` 为准。已有索引直接作为 `<I>`；没有时在 `<W>/source-index.json` 建立。保留原来源 ID、定位、覆盖与盲区，只补新增资料、必要补读及有效可读副本。

`source_root` 相对索引目录解析，`audit_layer.path` 也沿用其索引目录基准。保持索引位置；迁移时同时重定位。原文件是权威来源，审计副本是同一资料的机器读取层。页面取材仍需阅读相关原文，不把上游已登记视为本页已经理解。

缺少有效 PDF、Word、PPT 审计副本时，执行预处理；已有有效副本会复用。扫描件等无法直接抽取的资料使用对应文件或 OCR 能力，登记方法、定位和实际盲区。

```bash
node "<Skill>/scripts/prepare-audit-sources.mjs" --source-index "<I>"
node "<Skill>/scripts/validate-source-index.mjs" "<I>" --stamp
```

处理 `errors` 并检查 `warnings`、原文件及副本的实际可读性；`valid=true` 不能替代文件读取。只有新增或变化的资料需要重新登记、抽取；校验已有登记不等于重建索引。核查前使用当前索引的版本标记，来源变化后重新盖标并续检；无变化的预处理保持原文件不动。

当受众、任务、已确认判断与材料能力足以约束页面内容时进入展开，保留会影响后续判断的未知。

## 2. 页面展开与取材

每页明确观众需要理解什么、凭什么成立、适合怎样表达。把判断发展成具体事实、解释、比较、案例、图表、流程或行动；一个判断可由多页证明，取材不足时回源、补证或保留边界。

需要组织叙事推进时读取 `storytelling`；页面角色、标题链与内容组织读取 `slide-copy`。先承接项目记忆中的已采用方法；出现新的论证或页面组织问题时读取并调用 `planners-method-wiki`，传入当前问题、可用材料和同一份项目记忆。没有 Proposal 时也直接调用该独立 Skill；方法库选择、Lens / Recipe 检索及采用记录遵循其入口，查询不重建项目来源索引。

按 `templates/page-architecture.json` 和 `contracts/page-architecture.schema.json` 维护活动页面工作结构 `<A>`。Proposal 首次交接先用上游校验器验证结构和批准反馈，然后转换字段：

```bash
node "<Proposal>/proposal-co-creation/scripts/validate-page-architectures.mjs" "<上游结构>"
node "<Proposal>/proposal-co-creation/scripts/validate-page-review-feedback.mjs" --feedback "<上游批准反馈>" --architecture "<上游结构>"
node "<Skill>/scripts/adapt-proposal-architecture.mjs" --input "<上游结构>" --output "<A>"
```

两个校验回执均需有效，且反馈 `overall_decision=approve`。转换器保留认知任务、判断、证据需求，将非空边界、图表和布局要求写入内容块，并将附录展开为页面；输出仍需按页面任务选择 `page_type` 和素材。恢复已有工作结构时继续编辑它，不重跑转换覆盖返修。拆合页时在 `<M>` 或材料包注明与上游判断的对应关系。

边展开边按 `templates/page-material-packs.json` 准备 `<K>`：只收集页面实际需要的原文、数据、定位、限制、素材与缺口。材料包帮助写作，不再编译整库证据或等待另一次结构批准。

图片登记到 `<V>`；格式见 `contracts/asset-manifest.schema.json`，提取、处理与内容检查时读 `references/image-lifecycle.md`。复用已有有效素材和检查结果，保留原图，按需处理并记录关系。采用图片需确认对象、证据内容和清晰度；尺寸与 Hash 不能替代看图，视觉能力不足时交给用户确认。

```bash
node "<Skill>/scripts/validate-page-architecture.mjs" "<A>" --assets "<V>"
node "<Skill>/scripts/validate-page-materials.mjs" --materials "<K>" --architecture "<A>" --sources "<I>" --assets "<V>"
node "<Skill>/scripts/validate-asset-manifest.mjs" "<V>"
```

每页的内容任务、证明需要与取材位置明确后继续写作；重要缺口保留在当前任务中，而不是用泛化结论填满页面。

## 3. 写完整逐页稿

使用 `slide-copy` 将页面任务与材料写成完整内容，遵循用户指定的语气、密度和讲述或独立阅读用途。风格来自项目参考与已有决定，记录在项目记忆；不设置固定样页数量或常规校准审批。

按 `templates/by-page.md` 写入 `<D>`：`Page Content` 是观众实际看到的内容，`Speaker Notes` 保留讲述解释与衔接，`Production Notes` 只写制作所需的关系、素材用途与限制，`Sources` 给出真实来源 ID 和定位。

数据、表格和图表写出实际内容、单位、时间、口径、比较关系与结论。图片使用真实资产路径，说明内容作用。根据页面任务安排信息层级、拆页或移入备注，保留必要事实与限定；完整稿应能直接用于制作，而不是主线摘要或待填关键词。

```bash
node "<Skill>/scripts/validate-bypage.mjs" "<D>"
node "<Skill>/scripts/validate-asset-manifest.mjs" "<V>" --final
```

全部页面都有可制作的正文、所需数据与素材、可回查来源后进入核查。格式通过只说明接口可读，不证明内容准确或充分。

## 4. 核查与完整图文审阅

### 独立事实核查

读取 `planners-fact-check` 的「调用与续检」，交付该 Skill 路径、当前正式稿、权威索引 `<I>`、结果位置 `<F>`。按该规则复用独立核查子代理，记录其 ID、已核版本和来源读取范围到 `<M>`；等待真实结果落盘。

核查当前成品中的数字、引用、主体、时间、限定和事实强度，带上索引盲区，输出可疑项。Proposal 的结构批准不等于完整稿核查；已有核查只有仍覆盖当前稿件、来源和盲区时才复用。稿件或依据变化后更新结果，保留未变化的有效核查工作，不直接改 Hash 宣称已核过。

```bash
node "<Skill>/scripts/validate-fact-audit.mjs" --audit "<F>" --copy "<D>" --allow-human-review true
```

处理 `errors` 并检查来源仍覆盖当前依据；读取 `human_review_required`。`confirmed` 是待改事实，先修正再续检；需保留的边界由用户逐项明确裁定，核查员据实际决定记录 `accepted_with_caveat`，再绑定当前稿件生成审阅。校验有效不等于所有疑点已解决。

### 审阅与反馈续接

读取 `planners-review-core`，通过本 Skill 的 adapter 展示完整正文、表格、图片、来源及事实例外。公共模组负责壳、传输与宿主；本 Skill 负责映射、收件回写和决定解释。

```bash
node "<Skill>/scripts/start-bypage-review.mjs" --copy "<D>" --audit "<F>" --assets "<V>" --review-dir "<R>" --kind final
```

有 `review_open` 工具时加 `--surface-only`，把返回的 `surface` 绝对路径交给它；`surface_ready` 仅表示生成完成。否则同一入口启动或复用本地宿主，读取 `opened`、`url` 和反馈路径，如实报告打开状态。等待用户提交时结束当前回合。

用户提交后先收件，再读取回执、正式稿和反馈：

```bash
node "<Skill>/scripts/review-inbox.mjs" --surface "<R>/review-surface.json"
```

检查 `ok`、`imported` 与 `skipped`，区分未提交和同一提交已收件。未提交时继续等待；已收件的同一提交使用现有收据与反馈，并核对当前版本。inbox 保留原稿、回写文字与排序、追加历史，用户修改后的正式稿成为后续输入。按 `page_mapping` 更新页面材料对应；原文冲突时保留提交与草稿，先解决冲突。

有上传图片时，登记对应来源，并执行：

```bash
node "<Skill>/scripts/import-review-assets.mjs" --feedback "<R>/review-feedback.json" --manifest "<V>" --source-id "<本轮上传资料的来源ID>"
```

同批文件确属同一来源才共用 `--source-id`；不同来源分批导入。读取返回的 Asset ID，检查图片内容后记录真实 `visual_check`，回写材料包、正文引用和素材状态。上传行为本身不是视觉核查通过。

`requires_fact_recheck` 为真，或文字、素材、依据已经变化时，先完成修改并更新受影响的核查，重新生成审阅面；旧反馈只作为返修意见保留，不能批准新版本。没有这些变化时校验本轮反馈：

```bash
node "<Skill>/scripts/validate-review-feedback.mjs" --feedback "<R>/review-feedback.json" --copy "<D>" --audit "<F>" --kind final
```

反馈 `valid` 只表示有效，还需读取 `overall_decision`；`revise` 时按意见返修，上一轮要求修改的页面保持待复核，不由模型恢复成批准。审阅上下文记录本轮资产清单，资产变化或旧上下文未记录资产版本时重新检查并生成完整审阅。当前正式内容、核查和素材有效且用户真实提交 `approve` 后才交付。

## 5. 交给 PPT Hell

从当前批准版本生成交付，原有索引、材料包、核查与审阅记录保留在项目中：

```bash
node "<Skill>/scripts/build-reviewed-copy.mjs" --copy "<D>" --audit "<F>" --feedback "<R>/review-feedback.json" --manifest "<V>" --output "<Project>/deliverable/by-page.md" --assets-dir "<Project>/deliverable/assets"
```

检查返回的 `valid` 与输出，确认正文和制作说明中的图片路径可读、交付资产清单有效，必要内容与限定未在打包时丢失。在 `<M>` 记录本次制作快照对应的正式稿、核查、批准反馈和交付路径。交出 `by-page.md`、`assets/` 及其中资产清单的绝对路径，同时交出 `<M>`、`<I>`、正式稿、核查与反馈的原路径、已确认内容边界和重要盲区。

由 PPT Hell 调用时交回原制作流程；用户直接使用或来自 Proposal 时提示使用 `$planners-ppt-hell`。下游使用制作快照，并回查对应正式稿及其核查，不把正式稿的 Hash 冒充制作快照的 Hash。沿用来源、读取层和仍有效的核查；仅改版式无需重复内容核查，改变文字事实、图片证据或核心判断时回写同一正式稿、续检并重出批准快照。

本 Skill 完成于：完整页面已被审阅，事实疑点有有效处理，交付路径真实可用，PPT 制作者可以继续工作。项目偏好与决定保留在项目记忆；维护接口时参考 `references/architecture.md`。
