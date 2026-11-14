# Planners Bypage

[![Version](https://img.shields.io/badge/version-1.2.0-0f766e)](https://github.com/thePlannerIvan/planners-bypage/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2563eb)](LICENSE)
[![Validation](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml/badge.svg)](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml)

**把确定下来的 Storyline，或者一桌杂乱的多文档和图片素材，变成每一页都能直接看、直接改、配好真图、而且每个数字都过过审计的 PPT 逐页文案包。**

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

---

## 一句话看懂：它帮你做什么（以及不做什么）

写长 PPT 最痛苦的是两个极端：要么让 AI 空写大纲，字少得没法交差；要么资料没对口径直接画 PPT，排版好了才发现某一页算错了数据、配错了图，返工崩溃。

**Planners Bypage** 卡在“定主线”和“做 PPT 版面”之间，只把一件事做到位——**产出经得起核查、图文齐备的逐页稿**：

```text
3 个入口之一：Proposal 主线 / 杂乱多文档+原图 / PPT 阶段内容返修
  → 1. 读懂材料与意图，记录未读盲区（二进制 PDF/DOCX 缺抽取器会主动提醒或补救）
  → 2. 扩写每页完整文案 + 筛选裁剪真实图片 + 复杂关系自动画成可见 SVG 示意图
  → 3. 召唤独立上下文事实核查员（核对数字、分母、主体与限定条件）
  → 4. 打开图文混排审阅台（自动保存 / 拖曳调页序 / 局部提交修改）
  → 交付：deliverable/ 制作包（by-page.md + assets/ + production.json）→ 交给 planners-ppt-hell
```

**明确边界：它不生成 `.pptx` 文件。** 排版、品牌模板和 PowerPoint 导出交给下一棒 [`planners-ppt-hell`](https://github.com/thePlannerIvan/planners-ppt-hell)。

---

## 核心亮点：为什么比普通“写个逐页文案”靠谱

- **不会出现“此处放一张流程图”的空气占位符**：页面需要因果链、路径、分叉或时间轴时，自带 `pele` 引擎直接把关系画成可见的纯 SVG 示意图嵌入同一图文审阅台；图里写的文字也会被事实核查器一并查验。
- **真实图片资产全检入**：帮忙筛选、裁剪、校验项目自带配图并记清来源，交付时随着逐页稿打包进 `assets/` 和 `production.json`，下个环节不用满文件夹找图。
- **独立上下文防自夸核查**：完稿给用户看之前，会自动调用 [`planners-fact-check`](https://github.com/thePlannerIvan/planners-fact-check) 拿着原资料对照成品重算指标，堵住改稿时的口径漂移。
- **所见即改的图文审阅台**：网页打开就是完整每页正文、真图和备注。你可以直接改字、悬停拖曳页序、查看/恢复历史版本，也能单对某一页发起批注让 AI 只重修那几页。

---

## 什么时候选我 vs 选别的 Skill

| 你的现状 | 选哪个 Skill | 理由 |
| --- | --- | --- |
| 还在摸索方向、资料冲突大，不确定整体分几章讲什么 | 先用 [`Planners-Proposal-System`](https://github.com/thePlannerIvan/Planners-Proposal-System) | 先在轻量 Storyline 里把主张和取舍磨透 |
| 主线已定，或者材料现成但混乱，要快速写出每页详细文案+真图+过数字核查 | **本 Skill (`planners-bypage`)** | 专注把每一页内容写实、图配齐、数字查准 |
| 逐页文案都定完了，现在要套模板、画排版、导出可编辑 `.pptx` | 直接用 [`planners-ppt-hell`](https://github.com/thePlannerIvan/planners-ppt-hell) | 专攻视觉版式设计、模板复用和可编辑 PPTX 导出 |

---

## 快速开始与安装

### 1. DSH 用户（推荐）

通过 [Planners Form](https://github.com/thePlannerIvan/planners-form) 在 DSH 设置里勾选 `planners-bypage` 一键安装。

### 2. Codex / Claude Code 用户

```bash
npx skills add https://github.com/thePlannerIvan/planners-bypage --skill planners-bypage
```

或克隆到本地 Skill 目录：

```bash
git clone https://github.com/thePlannerIvan/planners-bypage.git ~/.codex/skills/planners-bypage
# 或
git clone https://github.com/thePlannerIvan/planners-bypage.git ~/.claude/skills/planners-bypage
```

### 3. 直接这样开始

```text
使用 $planners-bypage 接手刚才定好的 Storyline（或这个文件夹里的多份资料与图片）：
帮我展开成完整逐页内容，需要流程图的地方直接画出来，做完事实核查后打开审阅台让我修改。
```

### 运行时依赖与推荐工具

- **基础运行**：Node.js 20+（解析 PDF/Word/PPT 原文建议本机有 `pdftotext`、`pandoc`、`soffice`）。有 DSH 时挂入侧栏审阅，无 DSH 时自动起本地浏览器页面。
- **自动按需加载的公共模组**（首次缺失时自动拉取至 `~/.planners-modules/`）：
  - [`planners-source-index`](https://github.com/thePlannerIvan/planners-source-index) —— 原文回源定位与盲区登记
  - [`planners-fact-check`](https://github.com/thePlannerIvan/planners-fact-check) —— 审阅前独立上下文数字与引用审计
  - [`planners-review-core`](https://github.com/thePlannerIvan/planners-review-core) —— 图文审阅工作台桥接与本地宿主
  - 另含示意图引擎 `pele@1.6.0`（首次画图自动安装至 `~/.planners-modules/pele-pkg`）
- **协同写作 Skill**（环境中已装时按需配合）：[`slide-copy`](https://github.com/thePlannerIvan/slide-copy)、[`storytelling`](https://github.com/thePlannerIvan/storytelling)、[`planners-method-wiki`](https://github.com/thePlannerIvan/planners-method-wiki)。

---

<details>
<summary>开发者说明：环境变量、交付物清单、目录结构与验收命令（普通用户可忽略）</summary>

### 最终交付目录 `deliverable/`

```text
deliverable/
├── by-page.md          # 带标题、正文、备注、制作意图与 Sources 定位的逐页正式稿
├── assets/             # 已筛检裁剪的图片资产与 pele 生成的 SVG 示意图
└── production.json     # 供 planners-ppt-hell 导入的结构化生产快照
```

### 公共模组解析与示意图确定性校验

适配器（`scripts/lib/planners-modules.mjs`）按以下顺序本地优先查找公共模组：
`$PLANNERS_MODULES_HOME` → `<skills-root>` → `02-skills-library/<分类>` → 用户级目录（`$PLANNERS_MODULES_INSTALL_DIR` → `$PLANNERS_MODULES_HOME` → `~/.planners-modules/`）。设 `PLANNERS_NO_AUTO_INSTALL=1` 可禁止联网安装；`PLANNERS_MODULES_REF` 可锁定分支/tag。

示意图文字源留在 `.bypage-work/diagram-manifest.json` 供事实核查阅读，`pele@1.6.0` 通过校验门防止手工篡改 SVG 文本导致图文不一致：

```bash
node scripts/render-diagrams.mjs --manifest .bypage-work/diagram-manifest.json --assets .bypage-work/asset-manifest.json --copy by-page.md
node scripts/validate-diagrams.mjs --manifest .bypage-work/diagram-manifest.json --assets .bypage-work/asset-manifest.json --copy by-page.md --final --check-render
```

### 测试与目录结构

```bash
npm ci && npm test
node --test scripts/lib/planners-modules-install.test.mjs
```

```text
planners-bypage/
├── SKILL.md
├── agents/openai.yaml
├── contracts/           # 页面架构、材料包与资产清单契约
├── evals/               # 结构 / 审阅 / 图片 / 事实核查 / 交付五类回归测试
├── references/          # 内容交接、图片生命周期、示意图生命周期与工作台指南
├── scripts/             # 校验器、审阅台生成、资产处理与交付装配
└── templates/           # source-index / page-architecture / asset-manifest / by-page
```

</details>

---

## 品牌边界、开源协议与商业合作

- **许可协议**：以 [AGPL-3.0-only](LICENSE) 发布，可商业使用，修改版或通过网络提供的服务须公开源码。
- **署名边界**：出处保留在 [NOTICE](NOTICE)；工作过程文档可留作者信息，默认不写入客户最终交付稿；商标与二开要求见 [TRADEMARK.md](TRADEMARK.md)。
- **商业支持**：工作流定制、私有部署、企业培训或闭源授权，请联系 `Lawyif@163.com` 或访问 [demyth.info](https://demyth.info)，详见 [COMMERCIAL.md](COMMERCIAL.md)。

## 相关项目

- [Planners Proposal System](https://github.com/thePlannerIvan/Planners-Proposal-System) —— 上游策略共创与 Storyline 工作台
- [Planner's PPT Hell](https://github.com/thePlannerIvan/planners-ppt-hell) —— 下游 SVG 页面制作与可编辑 `.pptx` 导出
- [Planners Fact Check](https://github.com/thePlannerIvan/planners-fact-check) —— 独立上下文事实漂移审计
