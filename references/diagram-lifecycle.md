# 示意图生命周期

内容阶段的图做什么、不做什么，以及怎么让它可审阅、可核查、可制作。

## 什么时候该画

一页的判断靠**关系**成立时，才画：

| 关系 | 例子 | 合适的图型 |
|---|---|---|
| 因果推进 | 「所以」链、问题→判断→主张 | `flowchart TD` |
| 流程与卡点 | 数据管线、交付流程、失败断点 | `flowchart TD` |
| 分叉与汇合 | 多条路径共用同一骨架 | `flowchart LR/TD` + 多分支 |
| 聚簇与抽样 | 1000 篇分成几簇、每簇取几篇 | `flowchart TD` 或 `mindmap` |
| 时间与阶段 | 三轮验证、路线图 | `timeline` / `gantt` |
| 位置与取舍 | 品类定位、优先级矩阵 | `quadrantChart` |
| 结构分层 | 架构、系统组成 | `flowchart TD` + 侧挂节点 |
| 占比 | 预算、来源构成 | `pie` |
| 战略演化 | 能力与可见性的迁移 | `wardley-beta` |
| 归因结构 | 问题的主因/次因 | `ishikawa` |

不该画的情况：图只是把一段话换成方框（那用列表更好）；需要精确几何或自定义视觉隐喻；图本身是设计主体。后两种留在 `Production Notes` 交给制作端。

## 怎么写标签

- **用页内原话**。标签是页面的另一份文本副本，不是重新创作。原话是「大模型长文本截断」就写这个，不要改写成「上下文超限」。
- 一条信息一行，用 `<br>` 换行；不要靠 `\n` 或长句硬撑宽度。
- 长中文标签设 `wrap`（如 `12`）让渲染器插入软换行；否则整块图会被横向撑宽。
- 数字、主体、时间、限定必须与正文一致。图里的数字同样过事实核查。

## 适配页面：先定方向，再定画框

**方向比缩放重要。** 同一份源换个方向，占页面积能从 26% 变成 100%：

| 写法 | 内容尺寸 | 宽高比 | 16:9 页里按 contain 缩放后 |
|---|---|---|---|
| `flowchart TD`（四步链） | 253×486 | 0.52 | 占 **26% 宽**、100% 高 —— 左右大片留白 |
| `flowchart LR`（同一内容） | 982×109 | 9.0 | 占 **100% 宽**、22% 高 —— 像一条横向流程带 |

所以：横版页上的流程/链条用 `LR`；竖版页、文档、侧栏用 `TD`。方向选错，靠放大补不回来。

**画框（`options.frame`）** 用来把图钉进页面的可用区，让每张图占同样的版面：

```json
{ "options": { "max_width": 900, "frame": { "width": 1280, "height": 650 }, "fit": "contain" } }
```

- `contain`（默认）画布就是画框尺寸，内容等比居中；**画布透明**，空隙不会变成白盒；
- `width` 钉住宽度、高度按内容比例走；`height` 反过来 —— 这两个不留空隙，适合放在窄栏或嵌进版面；
- `max_width` 要设成接近画框宽度（如 900–1000），否则窄内容会被放大到字大得离谱；
- 画框是**交付尺寸**，审阅页只会等比缩放它，不会再重排。

## 实时自适应：审阅链路里做不到

`pele` 自己提供 `mount()`：容器尺寸变了自动重排，是真·实时。但审阅面里用不上，原因三条：

1. 审阅页渲染正文时会**转义 raw HTML**（除 `<br>`），注入 `<svg>`/`<script>` 会被当文字显示；
2. 图片走 `<img>`，是隔离文档，里面有 JS 也跑不了；
3. 要让它跑起来，得改 `planners-review-core`（五个 Skill 共用）并放开"正文可执行脚本"，代价与风险都不划算。

所以：**图和页面尺寸的关系在渲染时定死，改画框就重渲染**（约几十毫秒，不会觉得慢）。需要边调边看时，另起一个本地预览（`pele.mount()` + 可拖拽容器），不接进审阅链路。

## 图型能表达什么、不能表达什么

`pele` 支持 Mermaid 12.1 内置的全部图型（flowchart、swimlane、sequence、class、state、ER、gantt、gitGraph、pie、mindmap、kanban、timeline、journey、quadrant、xychart、requirement、sankey、architecture、C4、block、railroad、treeView、cynefin、wardley、eventmodeling、usecase、venn、ishikawa、packet、radar、treemap 等），但它是**关系词表，不是版面语言**：节点放在哪由布局引擎决定，你指定不了"三等分的三角形"。

「几何本身就是含义」的图——颠覆三角、漏斗、金字塔、同心圆、自定义矩阵——Mermaid 拼不出来，硬拼只会得到形似的流程图。这类图有两条路：

- 内容阶段只要求**关系正确**（谁作用于谁），几何留给 `Production Notes`，由 PPT Hell 按版面重绘；
- 或者**手工做一张 SVG**（如 `archify`），和照片一样登记进资产清单（`kind: illustration`），审阅时看到的就是真图。

判断标准：评审时要靠这个形状说服人（三力互锁、逐层收窄），就必须手工做；只是要说明三者关系，流程图够用。

## 依赖与版本

渲染器是 `pele`（Mermaid 语法、自己的布局、纯 SVG 输出、零依赖、Node 侧同步运行，不需要浏览器）。

- 版本**钉死**在 `scripts/lib/diagram-render.mjs` 的 `PELE_VERSION`；渲染确定性是 Hash 门禁的前提，换版本必须整体重渲染并重新登记。
- 解析顺序：`$PLANNERS_PELE_ENTRY` → `$PLANNERS_PELE_HOME` → 项目或父级 `node_modules/pele` → `~/.planners-modules/pele-pkg`；都没有时自动装到最后一处（`PLANNERS_NO_AUTO_INSTALL=1` 可关掉自动安装）。
- 项目里自己装了 `pele@1.6.0` 会被优先用上，适合需要固定环境的项目。

## 渲染与主题

产物必须是**自包含 SVG**：走 `<img>` 时是隔离文档，页面 CSS 变量进不去。因此主题和字体在渲染时烘焙进内部 `<style>`。

- `theme.preset`：`paper`（浅底，默认）或 `ink`（深底）。
- `theme.variables`：覆写任意 `--pele-*`，用于对齐具体项目的版面色彩。
- `options.max_width`：布局宽度（默认 560）。窄容器会触发自动转纵向，字号得以保住；宽图（如四分叉）可能超出这个宽度，这是正常的，不要为了压宽度牺牲可读性。
- `options.font_size`：默认 15；`options.wrap`：按字数软换行。

## 工作流

```bash
# 1. 写源、登记、渲染、同步资产清单
node "<Skill>/scripts/render-diagrams.mjs" --manifest "<G>" --assets "<V>" --copy "<D>"

# 2. 校验（哈希 / 图内文字 ⊆ 源 / 资产对齐 / 正文引用 / 视觉检查）
node "<Skill>/scripts/validate-diagrams.mjs" --manifest "<G>" --assets "<V>" --copy "<D>" --final --check-render

# 3. 正文里引用产物（相对正式稿所在目录）
#    ![这张图让人看懂什么](diagrams/asset-xxx.svg)
```

`render-diagrams.mjs` 只产出文件、不改正文；正文引用由写稿的人加，这样图片通道、生产导出、PPT Hell 都不需要改动。

## 会被挡下的情况

| 现象 | 报错 | 处理 |
|---|---|---|
| 手改 SVG 里的字 | `render_hash_mismatch` / `text_drift` / `render_drift` | 改源，重渲染 |
| 只改源没重渲染 | `render_drift` | 重跑渲染 |
| 图没进资产清单 | `asset_missing` | 带 `--assets` 重跑渲染 |
| 图没被正文引用 | `copy_reference_missing` | 在对应页加引用 |
| 图没有事实出处 | `source_id_required` / `asset_source_id` | 补 `source_id`，指向来源索引里的真实条目 |
| 没看过就交付 | `visual_check_required` | 真看一次再写 `passed` |

## 与下游的边界

- 图是**内容阶段的可见化 + 制作参考**，不是终稿版面。自动布局给得出结构，给不出设计感。
- `planners-ppt-hell` 拿到 `production.json` 与 `<G>` 后自行判断：直接置入、按版面重绘、或换用更合适的视觉隐喻。
- 重绘时以图内的字为准，不得另起措辞；改字要回到 Bypage 改源并重渲染，让核查跟着走。
