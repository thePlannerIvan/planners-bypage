# By-page 工作稿格式

新项目的逐页文案只有一份工作稿：`<Project>/.planners/by-page.md`。它是一份普通的 `planners-doc/2` 文档，结构（文档头、章节 / 页 / 标题块、锚点、图片、页末出处）由 `planners-review-core/contracts/planners-doc.md` 定义；本文件只规定 Bypage 怎么把三段写进去、怎么接住 Storyline、怎么交付来源与核查。

- 模板：[`templates/by-page.md`](../templates/by-page.md)
- 真实样例：[`evals/fixtures/labbrand-by-page.md`](../evals/fixtures/labbrand-by-page.md)（朗标笔试案，4 章 4 页，含图、表与页末出处）
- 校验：`scripts/validate-bypage-doc.mjs`
- 工作台：`planners-review-core/scripts/doc-workbench.mjs`

## 1. 文档头

第一行必须是 `---`，三个字段，再用 `---` 收口：

```md
---
contract: planners-doc/2
doc: by-page
project: 朗标笔试案
---

# 一、开场
```

| 字段 | 值 |
|---|---|
| `contract` | 固定 `planners-doc/2` |
| `doc` | 固定 `by-page`。`storyline` 是上游文档，不套用这里的三段规则 |
| `project` | 项目名，非空。**它就是文档名**，工作台用它显示「这是哪份稿」 |

字段写法、闭合、重复与未知字段的处理跟随 `planners-doc/2`；这里不加第二个文档头。正文里不再写文档标题行：文件头之后的第一条结构就是 `#` 章节。

## 2. 层级与页身份

| 写法 | 是什么 |
|---|---|
| `#` | 章节 |
| `##` | 页，交付时的一屏 |
| `###`–`######` | 标题块；页内只认 `### 正文 / 口播 / 制作` 三段 |
| 页末连续的引用 | 出处区（依据、来源、定位） |

- 页身份是「所在章节 + 顺序 + 标题」；页号由顺序决定，**不写进正文**。
- 页与页之间不加分隔符：`##` 本身就是边界。
- 页内三段按 `正文 → 口播 → 制作` 排列，各出现一次。三段之外的自定义标题块不被接受；需要说明的内容归入三段之一，或回上游改主线。
- 出处不是标题块：它由页末连续的引用构成，位置就是语义。写 `### Sources` 会被拒（`page_section_unknown`），并提示改成页末引用。
- 不手写块锚点（`<!-- b:… -->`）：工作台首次打开时补写，手写容易重复。

## 3. 三段写什么

| 段 | 必填 | 写什么 |
|---|---|---|
| `### 正文` | 是 | 观众实际看到的完整文案：事实、解释、比较、案例、数据、行动。可以是段落、列表、表格、图片、引用；口径、单位、时间与限定要写清。**不能为空**。 |
| `### 口播` | 三段标题要有，内容可空 | 讲述时必要、但不适合上屏的补充、过渡或语气。 |
| `### 制作` | 三段标题要有，内容可空 | 只写影响理解的图文关系、表达要求或素材限制；版式、裁剪、模板交给 `planners-ppt-hell`。图块可以在这里，也可以放在正文里。 |

出处：每页至少一条，写在页末，逐条能回到原文（文件路径 / 页码 / 访谈编号 / 数据日期）。来源随文档交付。

规则：

- **正文不放核查角标。** 事实核查的结论留在 `fact-audit.json` 与对话里，不在正文标「待核」「已核」或脚注记号；工作台要能编辑任何一份工作稿，角标会把它绑死在某种审阅状态上。
- 一页只说清一个判断。一个上游要点需要多页才能讲清时可以拆页，拆页与合并是作者的显式写作决定（见第 5 节）。
- 空的口播或制作段是正常的：标题保留，内容留空，作者知道这里不用写。
- 正文中如果引用了一句话，那一块就是普通引用；它不在页末，因此不算出处。出处只认页末那一串。

## 4. 图

- 图只以文件形式进入文档：`![说明](相对路径)`，位图或 SVG 都行；相对路径相对文档所在目录解析。
- 文件必须存在，且登记在与文档同名的 `doc-assets/1` 清单（`by-page.md` → `by-page.assets.json`）。契约见 `planners-review-core/contracts/doc-assets.md`。
- 清单是派生索引：工作台打开时按正文重建；正文引用决定用哪张图、放在哪。删掉图块条目随之消失；换文件只换字节，正文路径不变。
- 图块与文字块同等：可编辑、可反馈、可拖动；对图提反馈让模型重画时，正文引用路径不变。
- 交互式图表不进文档；需要时以链接给出。示意图的文字源与渲染一致性归 `references/diagram-lifecycle.md`。

## 5. 从 Storyline 交接

Proposal 交接的是 `<Project>/.planners/storyline.md`（`doc: storyline`），不是旧 `page-architecture.json`。Bypage 直接读它，不再先转一份页级 JSON。

```bash
node scripts/import-storyline-doc.mjs --storyline "<Project>/.planners/storyline.md" --output "<Project>/.planners/by-page.md"
```

它做三件事，且只做这三件：

1. **页身份**：主线的「章节 + 顺序 + 标题」1:1 落到同序的 `##` 页；
2. **主张**：每页以「主张：」开头的段落原样成为 By-page 正文的开头一段，支撑按列表项带过来；
3. **出处**：主线的页末出处（连续的引用）整体带过来，仍是逐条引用。

产物只补三段骨架（口播 / 制作留空），已有逐页稿不覆盖。回执里的 `mapping` 按页列出 By-page 与 Storyline 的章节、序号、标题和主张，交接当场可核对。

页内标题块里的限定（如 `### 依据与边界`）不复制进 By-page：它是读主线时的限定与缺口，作者要判断哪些写进正文的限定、哪些放进 `制作`，不该原样上屏。

页数变化：

- **1:1（默认）**：页序、章节归属与标题一致，直接按位置对应。
- **拆页**：第一页保留主线标题，后续页用「原标题（续）」或「原标题：子题」；两页都保留主张的开头一段与同一份出处。
- **合并**：保留一个标题，把两页主张都写进正文；在项目记忆里记一行「By-page 第 N 页 ← 主线第 a、b 页」。程序不猜这种对应。
- **删页**：作者显式决定，删的是 By-page 的页，不动主线和来源索引。

旧 `page-architecture.json`（2.0 / 3.0）不再是新项目入口；旧项目按 `planners-doc/2` 重建后才能用新工作台。已有的旧逐页稿（页级 frontmatter）继续由旧脚本服务，不自动迁移。

## 6. 来源与核查

- 来源写在页末连续的引用里，是出处区，随文档交付。
- 核查记录落 `.planners/fact-audit.json`（`fact-audit/1.0.0`，结构归 `planners-fact-check`）。`artifact.sha256` 绑定当前 By-page 文件；`suspects[].location.page` 用整份文档的交付页序。
- 核查结论在对话里用一段话讲清：哪些可信、哪些可疑、哪些错、怎么改。正文和审查记录都不进工作台的编辑面。
- 改稿、换图或来源变化后，旧核查失效；先续检，再交付。

## 7. 校验

```bash
node scripts/validate-bypage-doc.mjs "<Project>/.planners/by-page.md" [--assets <doc-assets 清单>] [--text]
```

它先跑 `planners-review-core/scripts/validate-doc.mjs`（文档头、章节 / 页 / 标题块层级、锚点、图片存在、空页、页末出处），再用同一个切块实现 `lib/doc-blocks.mjs` 读页与块，加上第 2、3 节的 Bypage 规则；有图时再跑 `validate-doc-assets.mjs` 核对登记。**没有第二套解析器。**

退出码：`0` 合规（可有警告）、`1` 不合规、`2` 用法、文件或依赖错误。JSON 回执沿用公共校验器的形状，`checked` 额外给出 `pages_with_sections`、`body_blocks`、`source_blocks`、`images`。

Bypage 加的错误码：

| 码 | 什么时候 |
|---|---|
| `doc_kind` | 文档头的 `doc` 不是 `by-page` |
| `page_section_missing` | 缺 `正文 / 口播 / 制作` 中的某段（`field` 指出是哪段） |
| `page_section_duplicate` | 同一段在一页里出现两次 |
| `page_section_order` | 三段顺序不是 `正文 → 口播 → 制作` |
| `page_section_unknown` | 出现三段之外的自定义标题块（包括 `### Sources`） |
| `page_body_empty` | 正文段没有内容 |
| `page_sources_empty` | 页末没有出处（一条引用都没有） |

Bypage 加的警告（不阻断）：`page_sources_not_at_end`（页里有引用块但不在页末，它们不算出处）。

图片问题沿用公共校验器与 `doc-assets/1` 的错误码（`image_missing`、`asset_unregistered`、`asset_hash_mismatch` 等），不另造一套。

## 8. 工作台与反馈

```bash
node "<planners-review-core>/scripts/doc-workbench.mjs" "<Project>/.planners/by-page.md" --open
```

工作台按块读出文档、就地编辑、自动保存；只替换被改块的 raw，未编辑块逐字保留。第一次打开会补写缺失锚点并重建图片清单，这是正常落盘，不是内容改动。块级反馈、锁、待核对与本地收件箱的规则见 `planners-review-core/contracts/planners-doc-task.md`；操作口径见 [工作台操作](../references/workbench.md)。

## 9. 它不做什么

- 不评价文案好不好、来源可不可信、页序是否最优；格式通过不能替代内容判断。
- 不检查表格列宽、段间距和版式——那是 `planners-ppt-hell` 的事。
- 不把核查结论写进文档，也不生成核查角标。
- 不迁移旧逐页稿或旧 JSON 主稿；重建才进入新格式。
- 不替代工作台保存后的复验：文件被直接改过之后，先跑校验器再重新打开工作台。
