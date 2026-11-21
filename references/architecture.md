# Bypage 的职责与接口

日常执行以 [SKILL.md](../SKILL.md) 为准；本文件维护与相邻模块的职责边界。

| 所属方 | 职责与接口 |
|---|---|
| `planners-proposal` | 交付 `<Project>/.planners/` 内的 `storyline.md`、`project-memory.md` 与轻量 `source-index.json`（`source-index/2.1.0`） |
| `planners-bypage` | 把 Storyline 或原始资料写成适合编程 PPT 的 `.planners/by-page.md`；后台运行 `prepare-audit-sources.mjs` 补齐底账；协同核查并交接 |
| `slide-copy` / `planners-method-wiki` | 分别提供幻灯片文案写法与 `## 页面表达结构`（Markdown Wiki）；具体方法由独立 Skill 提供 |
| `planners-source-index` | 定义并校验 `source-index/2.1.0` 契约 |
| `planners-fact-check` | 独立核查员对 `by-page.md` 做全面事实核查，产出 `.planners/fact-audit.json` |
| `planners-review-core` | 唯一工作台与 `planners-doc/2` / `doc-assets/1` / `planners-doc-task/1` 实现（含 `task.diff`） |
| `planners-ppt-hell` | 通过 `init_svg_project.py --source "<Project>/.planners/by-page.md"` 直接解析逐页正文、素材与核查结果，制作 SVG 与 PPTX |

## 架构收敛原则

- 新项目统一工作区：`storyline.md`、`by-page.md`、`by-page.assets.json`、`source-index.json`、`fact-audit.json`、`diagram-manifest.json` 与 `assets/` 全在同一 `<Project>/.planners/` 下。
- 已退役：旧版 `.bypage-work/`、独立 `asset-manifest.json`（`1.1.0`）、旧 `page-architecture.json` 适配层与自建审阅 HTML 页。
