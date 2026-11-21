# 图片与资产规范

旧版独立 `asset-manifest.json` 已退役；所有图片与示意图资产统一随 `<Project>/.planners/by-page.md` 写入、存储和校验。

## 资产落点与登记（`doc-assets/1`）

1. **存放路径**：所有项目图片与生成的示意图 SVG 存放在 `<Project>/.planners/assets/`（或相对 `by-page.md` 所在目录的可达子目录），正文以标准 Markdown 图片语法（如 `![说明](<assets/图名>)`）引用。
2. **清单维护**：`planners-review-core/scripts/doc-assets.mjs`（以及工作台首次打开或 `render-diagrams.mjs` 传入 `--assets` 时）自动生成并同步同目录下的 `by-page.assets.json`（契约 `doc-assets/1`），记录 `path`、`kind`、`sha256`、`bytes` 与 `alt`。
3. **正文决定采用**：只要图片出现在 `by-page.md` 的 `### 正文` 或 `### 制作` 中，且 `by-page.assets.json` 哈希一致，交付 `$planners-ppt-hell` 时 `init_svg_project.py` 会直接抓取对应本地文件。
4. **视觉与来源底线**：
   - 未经人工或程序目检确认内容与出处一致的图片，不得放进最终交付；
   - 原图存在清晰度或隐私遮挡需求时保留原始版本于资料源目录，`.planners/assets/` 中存放用于配图或审阅的版本并在 `source-index.json` 标注来源。
