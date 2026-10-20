# Planners Bypage

[![Version](https://img.shields.io/badge/version-1.2.0-0f766e)](https://github.com/thePlannerIvan/planners-bypage/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2563eb)](LICENSE)
[![Validation](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml/badge.svg)](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml)

Planners Bypage 将已批准的 Storyline 展开成完整页面，或把多源资料组织成页面，经事实核查和完整图文审阅后交给 PPT 制作。

**它不制作 PPTX。** By-page 完成后，请使用 [Planner's PPT Hell](https://github.com/thePlannerIvan/planners-ppt-hell) 完成模板、Layout、SVG、视觉审阅和可编辑 PowerPoint 导出。

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

## 它解决什么

两条入口共用一条内容流程，来源、项目记忆和核查记录可以顺序承接：

```text
接手与理解 → 页面展开与取材 → 完整逐页稿
→ 独立核查 + 完整图文审阅 ↔ 修改 → PPT 交接
```

它允许重组和改写，但不得改变来源中的事实、数字、符号和限定条件。

## 适用与不适用

适合：

- 资料来自多个文档，需要先筛选再组织；
- 已有 Storyline 需要展开，或直接将资料组织成完整页面；
- 数字、引用、表格和衍生公式需要回到来源审计；
- 原始图片需要筛选、裁剪、校验并随 By-page 交付；
- 页面需要靠关系讲清楚（因果链、流程、分叉、聚簇、时间轴、象限、架构），而此时图还只存在于文字描述里。

不适合：

- 希望直接获得排版完成的 `.pptx`；
- 只需要一次简单文档摘要；
- 来源为扫描 PDF，但环境中没有 OCR 能力且不允许人工确认。

## 安装

通用 Skills CLI：

```bash
npx skills add https://github.com/thePlannerIvan/planners-bypage --skill planners-bypage
```

## 公共模组（缺了会自动装）

本 Skill 依赖若干**公共模组**（独立发布的条目，不是本仓库的一部分）：

- [`planners-review-core`](https://github.com/thePlannerIvan/planners-review-core) —— 审阅面契约、桥与本地宿主
- [`planners-source-index`](https://github.com/thePlannerIvan/planners-source-index) —— 来源索引契约与唯一校验器
- [`planners-fact-check`](https://github.com/thePlannerIvan/planners-fact-check) —— 事实核查契约与校验器

写作使用 `slide-copy`，叙事需要时使用 `storytelling`；遇到不熟悉的专业知识、分析方法或论证问题时直接调用 `planners-method-wiki`，沿用项目中已采用的方法。方法 Skill 在当前环境缺失时如实报告，不把公共模组安装器当成它们的安装入口。

某个模组不在本地时，本 Skill 的适配器会**自动从 GitHub 装它**，不需要手动准备。适配器找的地方按顺序：

1. `$PLANNERS_MODULES_HOME/<模组名>`
2. 本 Skill 的兄弟目录 `<skills-root>/<模组名>`（发布后的主路径）
3. monorepo 里 `02-skills-library/<分类>/<模组名>`
4. **用户级安装根**：`$PLANNERS_MODULES_INSTALL_DIR` → `$PLANNERS_MODULES_HOME`（仅当它已含该模组，或那目录还不存在）→ 默认 `~/.planners-modules/<模组名>`

前三条都没有时才自动安装（顺序不变，**本地永远优先、不会无条件联网**）；装到第 4 条那个**库外**用户级目录，**绝不写进** `02-skills-library` 工作树、`~/.codex|~/.claude|~/.gemini` 的技能目录、或任何系统目录。安装过程**不静默**：会打印缺哪个、找过哪些路径、从哪个 URL 装、装到哪、用的是 `git clone --depth 1` 还是 `npx skills add`、以及装到的 **commit**。装完先在暂存目录里验证（`SKILL.md` + 该模组声明的契约/校验器锚点文件都在），再用 rename 原子就位；**任何失败都会清掉暂存、不留半成品**，并给出可复制的手动安装命令。

要它**只报不装**（CI／离线／审计）：

```bash
PLANNERS_NO_AUTO_INSTALL=1 <你的命令>
```

| 环境变量 | 作用 |
|---|---|
| `PLANNERS_MODULES_HOME` | 指定已有模组所在目录（解析第 1 条，也兼作安装根） |
| `PLANNERS_MODULES_INSTALL_DIR` | 只指定**自动安装**的落点（优先级高于上面那条） |
| `PLANNERS_MODULES_REF` | 要钉的 tag 或分支（不设 = 装默认分支 HEAD） |
| `PLANNERS_NO_AUTO_INSTALL=1` | 只报不装；缺依赖时如实失败并打印手动命令 |

装的是**默认分支 HEAD**，日志里**永远打 commit**；HEAD 恰好被某个 tag 指着时，tag 也一并打出来。想钉版本就设 `PLANNERS_MODULES_REF`：

```bash
PLANNERS_MODULES_REF=v1.0.0 <你的命令>     # 钉在 tag 上
PLANNERS_MODULES_REF=main   <你的命令>     # 钉在某个分支上
```

钉了不存在的 ref 会**如实失败**（不会悄悄退回 HEAD），错误里带正确的可复制命令。

### 两条命令别搞混：谁装 Skill，谁抓依赖

**用户装一个 Skill** —— 用 Skills CLI，它会把条目放进各 agent 的技能目录：

```bash
npx skills add https://github.com/thePlannerIvan/<Skill 名> --skill <Skill 名>
```

**Skill 自己抓一个公共模组（内部依赖）** —— 用 `git clone`，落在库外的单一安装根：

```bash
git clone --depth 1 https://github.com/thePlannerIvan/<模组名>.git \
  "$HOME/.planners-modules/<模组名>"
# 想钉版本：加 --branch v1.0.0
```

**内部依赖为什么不走 `npx skills add`**：它没有 `--dir` 之类的落点参数，只会写进 `~/.claude/skills`、`~/.codex/skills` 这类 **runtime 技能目录**（那是发布器的领地，写进去等于多一份漂移副本）；而且它下载的目录**不带 `.git`**，拿不到 commit、也就没法追溯装的是哪一版。**门面命令归用户，内部依赖归 clone** —— 上面自动安装走的就是这条。


也可直接放入 Codex 或 Claude 的 Skill 目录：

```bash
git clone https://github.com/thePlannerIvan/planners-bypage.git ~/.codex/skills/planners-bypage
# 或
git clone https://github.com/thePlannerIvan/planners-bypage.git ~/.claude/skills/planners-bypage
```

## 环境要求

- Node.js 20+；
- PDF 建议安装 `pdftotext`；
- DOCX / ODT / RTF 建议安装 `pandoc`；
- 旧版 Word 或 PPT/PPTX 文本转换建议安装 LibreOffice（`soffice`）；
- 扫描件需要额外 OCR 工具。

转换工具缺失时，Skill 应该显式报告无法建立机器审计副本，而不是把未验证内容伪装成已审计事实。

## 使用

```text
使用 $planners-bypage，接收已有 Storyline 或整理这些资料，
展开完整逐页内容，核查并审阅后交付 by-page.md 与图片资产。
```

默认直接审阅完整 By-page。`bypage-draft.md` 是唯一可编辑正文，标题通常就是主张，备注按需填写；无需另建工作架构和材料包。编辑自动保存，版本入口负责查看与恢复，反馈任务用于请模型一起改。已有用户决定继续沿用；关键选择仍需用户裁定。旧 Storyline/sample 审阅 CLI 保留用于已有项目续接，不是新项目的常规审批关卡。

### 示意图：让图在审阅时就已经存在

页面要靠关系讲清楚时，正文里不该是一段 ASCII 图或"这里放一张流程图"。本 Skill 用 `pele`（Mermaid 语法 → 纯 SVG，零依赖、不需要浏览器）把图渲染成真文件，走图片通道：

```bash
node scripts/render-diagrams.mjs --manifest .bypage-work/diagram-manifest.json --assets .bypage-work/asset-manifest.json --copy by-page.md
node scripts/validate-diagrams.mjs --manifest .bypage-work/diagram-manifest.json --assets .bypage-work/asset-manifest.json --copy by-page.md --final --check-render
```

- 正文只留 `![意图](diagrams/asset-xxx.svg)`，与照片完全同构，审阅页直接显示、生产导出直接带走；
- 文字源（Mermaid）留在 `diagram-manifest.json`，图里的字因此可被事实核查读到，而不是藏在一张图里；
- 渲染确定性钉死在 `pele@1.6.0`：手改 SVG 会被 Hash、`--check-render` 和「图内文字 ⊆ 源」三重挡下；
- 图是内容阶段的可见化与制作参考，不是终稿版面 —— 上屏由 PPT Hell 决定置入还是重绘。

依赖会在首次使用时自动装到 `~/.planners-modules/pele-pkg`（`PLANNERS_NO_AUTO_INSTALL=1` 可关闭）。画法与取舍见 [示意图生命周期](references/diagram-lifecycle.md)。

## 交付边界

最终交付包至少包含：

```text
deliverable/
├── by-page.md          # PPT 的逐页内容稿
├── assets/             # 已确认、已处理的图片资产
└── production.json     # 供 PPT Hell 程序导入的制作快照
```

过程目录保留唯一正式稿、资产清单、Workbench 版本与任务、事实核查；工作结构和材料包按需保留。项目记忆与来源索引沿用最早阶段的活动原件，可能在 `.proposal-work`，不重复创建。完整交接见 [内容交接](references/content-handoff.md)。这些项目材料不应提交到公开 Skill 仓库。

## 目录结构

```text
planners-bypage/
├── SKILL.md
├── agents/openai.yaml
├── contracts/           # 页面架构、材料包、资产清单契约
├── evals/               # 结构 / 审阅 / 图片 / 事实核查 / 交付回归
├── references/          # 内容交接、图片生命周期、来源阅读与维护架构
├── scripts/             # 校验器、审阅接缝、资产导入与终稿装配
└── templates/           # source-index / page-architecture / asset-manifest / by-page
```

## 可靠性边界

- Source Index 保留原文件与机器审计副本的 Hash 绑定；
- 正式稿 Sources 提供来源 ID 与定位；复杂取材可使用可选材料包；
- 事实审计检查实际使用的数字、表格、衍生公式、符号和条件；
- Asset Manifest 绑定原图、处理图、裁剪参数、内容视觉验证和双 Hash；
- 完整稿 Workbench 绑定当前正文与事实核查；自动保存、历史版本与恢复和反馈任务分开。

## 开发与验证

```bash
npm ci
npm test

# 公共模组自动安装器自己的测试
node --test scripts/lib/planners-modules-install.test.mjs
```

公开验证集包含结构、审阅 Contract、图片、事实审计和交付五类测试。详见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

版本变更详见 [CHANGELOG.md](CHANGELOG.md)。

## 旧项目续接

当前流程见 [SKILL.md](SKILL.md) 和 [审阅页操作](references/workbench.md)。旧审计器与两轮审批的历史见 CHANGELOG，不作为当前运行指令；只有明确恢复旧反馈项目时才使用 legacy 接口。

## 授权、署名与商业服务

- 代码以 [AGPL-3.0-only](LICENSE) 发布；
- 请保留 [NOTICE](NOTICE) 中的项目来源和作者信息；
- 修改版应明确标注 fork 或改动，不得暗示官方背书，详见 [TRADEMARK.md](TRADEMARK.md)；
- 闭源授权、私有部署、工作流定制和培训见 [COMMERCIAL.md](COMMERCIAL.md)。

## English summary

Planners Bypage is a lightweight, source-traceable pre-production Skill that turns mixed documents and images into a reviewed PPT by-page manuscript and asset package. It does not render PowerPoint files; use [Planner's PPT Hell](https://github.com/thePlannerIvan/planners-ppt-hell) for editable PPT production.

## 自动验证环境

公开 CI 安装 Chromium，并检出公开的跨 Skill 依赖运行完整验收。
