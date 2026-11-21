# 示意图渲染与校验

当某页需要机制流、归因拆解或结构对照示意图时，可用 Mermaid 文字源通过 `pele@1.6.0` 渲染确定性 SVG（`diagram-manifest/1.0.0`），避免无源黑盒生图导致事实无法核查。

## 工作流程

1. 查看支持图型：
   ```bash
   node "<B>/scripts/render-diagrams.mjs" --types
   ```
2. 编写 `<Project>/.planners/diagram-manifest.json`（参考 [`templates/diagram-manifest.json`](../templates/diagram-manifest.json)）：
   - `output` 默认写向 `assets/<asset_id>.svg`（与 `.planners/by-page.md` 中的相对引用一致）；
   - **每张图必填 `source_id`**：指向 `source-index.json` 中的对应来源，确保图内表述可回查；
   - `visual_check` 初始为 `pending`，生成后必须查看 SVG 实际视觉效果再标记 `passed`（带 `method` 与 `notes`）。
3. 渲染与对齐检验：
   ```bash
   node "<B>/scripts/render-diagrams.mjs" --manifest "<Project>/.planners/diagram-manifest.json" --assets "<Project>/.planners/by-page.assets.json" --copy "<Project>/.planners/by-page.md"
   node "<B>/scripts/validate-diagrams.mjs" --manifest "<Project>/.planners/diagram-manifest.json" --assets "<Project>/.planners/by-page.assets.json" --copy "<Project>/.planners/by-page.md" --final --check-render
   ```
   - `render-diagrams.mjs` 会在字节变化时自动把 `visual_check` 复位为 `pending`。
   - `validate-diagrams.mjs` 直接用 `planners-review-core/scripts/lib/doc-blocks.mjs` 的 `parseDocument` 读取 `planners-doc/2` 各页块，核对文本子集、哈希、出处 `source_id` 与正文引用是否一致。
