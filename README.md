# Planners Bypage

[![Version](https://img.shields.io/badge/version-1.2.0-0f766e)](https://github.com/thePlannerIvan/planners-bypage/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2563eb)](LICENSE)
[![Validation](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml/badge.svg)](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml)

Planners Bypage 是一个轻量的前置 Skill：它把 Word、PDF、Markdown、PPT、表格和图片资料，整理成经过 Storyline 和逐页审阅、且可回溯的 PPT By-page 内容包。

**它不制作 PPTX。** By-page 完成后，请使用 [Planner's PPT Hell](https://github.com/thePlannerIvan/planners-ppt-hell) 完成模板、Layout、SVG、视觉审阅和可编辑 PowerPoint 导出。

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

## 它解决什么

把“读一堆资料，然后凭印象写 PPT”变成一条有人机确认点、有图片预处理、有来源索引和事实审计的简洁流程：

```text
来源覆盖 → 集中选择 → Storyline → 图文结构审阅
→ 逐页材料包 → 图片处理 → By-page → 事实审计与终审
```

它允许重组和改写，但不得改变来源中的事实、数字、符号和限定条件。

## 适用与不适用

适合：

- 资料来自多个文档，需要先筛选再组织；
- 需要先确认 Storyline，再逐页审阅；
- 数字、引用、表格和衍生公式需要回到来源审计；
- 原始图片需要筛选、裁剪、校验并随 By-page 交付。

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
- [`planners-report-kit`](https://github.com/thePlannerIvan/planners-report-kit) —— 报告装配与校验（仅带报告出口的 Skill 需要）

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
使用 $planners-bypage，读取这些项目资料，和我确认 Storyline，
再交付 by-page.md 与完整图片资产。
```

默认有三类人机确认：

1. **集中选择**：确认目标、受众、篇幅、改写强度和资料取舍，并留一轮自由补充意见；
2. **Storyline Review**：审阅章节、页级主张、来源和候选图片；
3. **By-page Review**：审阅每页标题、内容、事实状态和已处理图片。

## 交付边界

最终交付包至少包含：

```text
deliverable/
├── by-page.md          # PPT 的逐页内容稿
└── assets/             # 已确认、已处理的图片资产
```

过程目录 `.bypage-work/` 保留 Source Index、Page Material Packs、Asset Manifest、审阅反馈和事实审计记录，但不应随一般公开仓库提交。

## 目录结构

```text
planners-bypage/
├── SKILL.md
├── WORKFLOW.md
├── agents/openai.yaml
├── contracts/           # 页面架构、材料包、资产清单契约
├── evals/               # 结构 / 审阅 / 图片 / 事实核查 / 交付五套公开测试
├── references/          # 逐页写作、图片生命周期、来源阅读、提案语言
├── scripts/             # 校验器、审阅接缝、资产导入与终稿装配
├── stages/              # 01–08 分阶段工作流
└── templates/           # source-index / page-architecture / asset-manifest / by-page
```

## 可靠性边界

- Source Index 保留原文件与机器审计副本的 Hash 绑定；
- Page Material Packs 限定每页可用的事实、引用、图片和限制；
- 事实审计检查实际使用的数字、表格、衍生公式、符号和条件；
- Asset Manifest 绑定原图、处理图、裁剪参数、内容视觉验证和双 Hash；
- Storyline Review 和 By-page Review 都绑定当前 Contract 版本，避免旧反馈误应用到新稿。

## 开发与验证

```bash
npm ci
npm test

# 公共模组自动安装器自己的测试
node --test scripts/lib/planners-modules-install.test.mjs
```

公开验证集包含结构、审阅 Contract、图片、事实审计和交付五类测试。详见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

版本变更详见 [CHANGELOG.md](CHANGELOG.md)。

## 从 1.0 升级到 1.1

1.1 提升了 Source Index、Review Contract 和 Asset Manifest 的版本，并加入二进制文档审计副本、衍生公式操作数引用、符号不匹配检查、图片视觉门禁与交付路径校验。

对于 1.0 时尚未完成的项目，不要混用旧反馈或手工改版本号；请从来源登记阶段重建 Source Index，并重新生成 Asset Manifest 和两轮审阅 Contract。

## 从 1.1 升级到 1.2

> **本节是历史记录。** 1.2 那套审计器（`audit-final-copy.mjs` 四态流程）已于 2026-09-26 退役，事实核查改由公共件 `planners-fact-check` 承担 —— 见 `CHANGELOG.md`。

1.2 把事实审计从“机械命中后批量确认”改为“来源反推的独立归属核对”：所有来源/衍生事实都进入 Review Queue，每个数字展示命中的原文片段，并强制检查主体、指标、时间、单位、限定词和符号。`confirm` 只处理方案数字和非事实编号。

同时新增：

- `audit-final-copy.mjs --help` 和状态感知的 `--next`；
- 每个模式错误中的必需参数与完整命令模板；
- Storyline/By-page 反馈按 `history/round-NN.json` 追加留档；
- 无原生视觉、多语言临时脚本和未知 Python 环境的降级边界；
- 修复行首列表编号导致同句后续数字被误标为 `non_factual` 的问题。

未完成的 1.1 项目应重新运行 `prepare`。新的 `audit_policy_version` 会自动使旧语义放行失效，然后按 `prepare → confirm → resolve → check` 重建归属审计。

## 授权、署名与商业服务

- 代码以 [AGPL-3.0-only](LICENSE) 发布；
- 请保留 [NOTICE](NOTICE) 中的项目来源和作者信息；
- 修改版应明确标注 fork 或改动，不得暗示官方背书，详见 [TRADEMARK.md](TRADEMARK.md)；
- 闭源授权、私有部署、工作流定制和培训见 [COMMERCIAL.md](COMMERCIAL.md)。

## English summary

Planners Bypage is a lightweight, source-traceable pre-production Skill that turns mixed documents and images into a reviewed PPT by-page manuscript and asset package. It does not render PowerPoint files; use [Planner's PPT Hell](https://github.com/thePlannerIvan/planners-ppt-hell) for editable PPT production.
