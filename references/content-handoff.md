# Proposal / Bypage / PPT Hell 内容交接

本文件定义三阶段的文件归属与续接。调用方读取这份契约；来源字段以 `planners-source-index` 为准，核查规则及代理复用以 `planners-fact-check` 为准，审阅传输以 `planners-review-core` 为准。

## 项目内的一份活动文件

项目记忆记录项目目录、调用方/续接位置，以及下表的绝对路径。已有文件继续沿用；新项目使用默认位置。每次交接传路径，不传一个脱离原件的摘要包。

| 内容 | 唯一维护者与活动文件 | 下游如何使用 |
|---|---|---|
| 项目目标、用户决定、活动路径 | 各阶段追加到同一 `project-memory.md` | 读取并更新已有文件；默认在最早进入的阶段目录建立 |
| 已采用方法与应用边界 | 同一 `project-memory.md` 中的方法采用记录，按 `planners-method-wiki` 定义 | 沿用库路径、采用时版本、方法 ID / 全文定位、用途与未满足条件；已有问题直接承接，新问题再检索 |
| 来源 ID、原文件、读取层、覆盖、盲区 | 所有阶段维护同一 `source-index.json` | 保持位置和 ID，只增补实际新增或变化来源 |
| 当前判断与证明需要 | Proposal canonical `page-architecture.json` + Workbench head/revision | Bypage 保留原件，转换为自己的工作结构；实质改判断先与用户讨论 |
| 页面任务与取材 | Bypage 工作结构、材料包及资产清单 | 随页面展开与返修维护，不覆盖 Proposal 原件 |
| 完整逐页内容 | Bypage `bypage-draft.md` | 核查、收件、返修都读写此稿；交付打包由它生成 |
| 事实核查与当前稿状态 | 指向正式稿的 `fact-audit.json` + Workbench revision/snapshot | 检查绑定及裁定；上游结构状态不是完整稿事实核查 |
| 制作基线 | `deliverable/by-page.md` + `production.json` + `assets/asset-manifest.json` | 程序导出正文、备注、来源、资产及上游真实路径/Hash；PPT Hell 程序导入 |
| 画面内容与资产映射 | PPT Hell `page_content.json` + `source_assets.json` | 制作派生文件；保留 Bypage 页面身份、原页号、来源 ID 和资产 ID |
| 编辑后的画面 | PPT Hell 页面版本与输出快照 | 保存 SVG 版本、用户操作及内容差异；原 Bypage 核查只覆盖上游基线 |

默认共享记忆与索引放在 `.proposal-work`（Proposal 首入）或 `.bypage-work`（资料首入）。进入下一阶段不移动、不重建。`source_root` 相对索引目录，`audit_layer.path` 也相对索引目录；PPT 的本地 `source.md` 与重新编号的 `asset_001` 只是制作副本，不替代原来源索引或原资产 ID。

方法库不随阶段复制，方法采用记录也不另建一份交接摘要。有 Proposal 时复用其库与应用记录；资料直接进入 Bypage 时，在原项目记忆里建立采用记录并使用 Wiki Skill 的默认选择规则。PPT Hell 承接实际论证和表达需要，不重做策略判断。方法库版本变化时核对已采用对象的变化；方法中的历史案例事实不自动成为项目证据。

## 两次交接

**Proposal → Bypage：**交项目目录、记忆、索引、canonical 结构、Workbench head/revision 的绝对路径。Bypage 校验结构和当前 head，首次转换工作结构；已有 Bypage 工作时继续当前文件。继承已读来源及有效读取层，补读页面实际需要的细节，展开完整内容。不重复做 Proposal 已完成的来源登记与主线判断。保存回执和 pending task 是工作状态，不是批准门。

**Bypage → PPT Hell：**在现有 `build-reviewed-copy.mjs` 交付命令上加 `--production-json <deliverable>/production.json --memory <project-memory.md>`；活动工作结构、材料包分别加 `--architecture <path> --materials <path>`。现有核查、完整稿反馈和资产清单检查仍由交付程序执行。结构化导出复用正文解析，携带记忆、索引、正式稿、核查、反馈、原/交付资产清单的规范绝对路径及 SHA256，不由接收模型重新抄页。

```bash
python3 <ppt-hell>/scripts/import_bypage.py <new-project> --production <deliverable>/production.json
```

导入器校验基线/核查/反馈绑定和资产字节，直接生成制作正文、Speaker Notes、Production Notes、来源及本地资产映射。它只初始化空项目；已有工作台恢复原目录，保留编辑版本。Markdown 文档仍供阅读与旧入口使用，不再是模型反向拼装结构化内容的依据。

`page_key` 或 `page_id` 已存在时保留其身份。旧稿只有页号时，程序分配绑定原稿 Hash 的基线身份；新稿或重编号不会按标题、页序或相似文字猜测旧页对应。需要跨基线稳定身份时，在上游明确提供页面 ID。导入后，工作台页序变化不改变已登记页面 ID。

PPT Hell 先入但资料未整理时，将现有资料、用户决定、项目目录和续接位置交给 Bypage，不要求 Proposal 文件；完成后回到原制作流程。已有制作项目恢复原目录；已有 canonical 完整稿、有效核查和 snapshot 时直接制作。`page_content.json` 单独存在只说明有制作底稿，不自动证明内容已核查。

## 来源与核查的时机

| 时机 | 来源索引 | 事实核查 |
|---|---|---|
| Proposal 理解和共创 | 随实际读取建立/更新，交接前验证 | 不把结构编辑当成成品核查；如单独需要查关键事实，可提前查但只覆盖该成品 |
| Bypage 展开和取材 | 沿用索引，仅补新增资料、补读、盲区变化 | 完整逐页稿完成后、首次图文审阅前，独立核查当前成品 |
| Bypage 用户返修 | 新来源或证据变化才更新登记 | 同一核查员续检受影响内容；文字或页序改变后更新绑定，重新生成当前 snapshot |
| PPT 制作与视觉修订 | 新增证据图/外部材料时登记；纯装饰资产不冒充事实来源 | 内容变化按编辑后的 SVG/快照另行核查；原稿核查绑定继续只代表基线 |

Workbench 修改由页面版本存储维护，不承诺模型能把任意 SVG 编辑准确反写 Bypage 正式稿。上游正式稿、审计与 snapshot 是**制作基线**；编辑后的 SVG 以版本、操作和差异记录自己的 provenance，不能借基线核查宣称新文案已核查。数字、主体、时间、限定或证据发生变化时，向独立核查员交编辑后的 SVG/输出快照及新增来源，记录该版本的覆盖范围与疑点。确实需要更新正式稿时，明确回到同一 Bypage 正式稿编辑、核查、审阅并重出新基线；这是一次有授权的上游修改，不是自动反向同步。

普通 SVG 保存与输出不以逐页批准为条件。事实核查仍按实际对象记录裁定；视觉检查不能代替事实裁定。上游交付中的 `confirmed`/`no_source` 先处理；用户明确接受的边界由核查员记录 `accepted_with_caveat`。

交接完成于：程序导入的页序、身份、正文/备注和资产可核对；接收方能从真实路径恢复上游内容、来源、核查及制作位置，并能区分基线核查与编辑后画面的覆盖范围。共同记忆、来源索引和上游正式稿各保留一份。默认 Workbench 不创建 legacy feedback 文件；只有恢复旧项目时才使用它们。
