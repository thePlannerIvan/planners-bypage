# 交接、独立入口与返修

## 上游入口：承接 Storyline vs 直接来料

1. **从 `planners-proposal` 交接**：直接沿用同一 `<Project>/.planners/` 目录里的 `storyline.md`、`project-memory.md` 与 `source-index.json`：
   ```bash
   node "<B>/scripts/import-storyline-doc.mjs" --storyline "<Project>/.planners/storyline.md" --output "<Project>/.planners/by-page.md"
   ```
   保留已确认判断与分页关系；拆页、并页在 `project-memory.md` 中留痕。
2. **直接从资料进入（不要求 Proposal）**：当从 `$planners-ppt-hell` 或用户直接带资料触发时，在原项目目录（若已存在则**恢复原目录**）创建 `<Project>/.planners/`，建账 `source-index.json`（`source-index/2.1.0`）并写 `by-page.md`，无需先补 Proposal 交接物。

## 下游交接：直接交付 `$planners-ppt-hell`

不再经过 `page-architecture.json` 或旧生产导出中间包。交付时保证 `<Project>/.planners/` 内：
- `by-page.md`：通过 `validate-bypage-doc.mjs`（每页含 `正文 / 口播 / 制作` 三段、末段有 `>` 出处、无角标占位符）。
- `by-page.assets.json`（`doc-assets/1`）及引用的本地 `assets/*` 图片/示意图均实际存在、哈希一致。
- `fact-audit.json`：与当前 `by-page.md` 的 SHA-256 绑定（`validate-fact-audit.mjs` 通过，无 `confirmed` 或 `no_source` 阻断项）。

`$planners-ppt-hell` 通过 `init_svg_project.py --source "<Project>/.planners/by-page.md"` 直接解析分章、页序、三段内容与 `source_assets`。

## PPT 返修回到 Bypage

当 `$planners-ppt-hell` 阶段发现文案逻辑、口径或关键数字有问题时：
- **恢复原目录**：回到**同一 Bypage 正式稿**（`<Project>/.planners/by-page.md`），不得另起一份副本改；
- 修改正文与来源后，调用**同一核查员续检**（按 `planners-fact-check` 规则传入原上下文与最新 `by-page.md`）更新 `fact-audit.json`；
- 校验通过并经工作台或用户确认后，重新交给 `$planners-ppt-hell` 同步对应页。
