# By-page 文字工作台操作

适用于在工作台里审阅、拖拽重排和逐块修改 `.planners/by-page.md`。文档格式见 [By-page 格式](../contracts/by-page.md)；公共工作台契约见 `planners-review-core` 的 `contracts/planners-doc.md`、`contracts/planners-doc-task.md`、`contracts/planners-doc-diff.md`。

`<B>` 为本 Skill 根目录，`<K>` 为 `planners-review-core` 根目录，`<D>` 为 `<Project>/.planners/by-page.md`，`<S>` 为 `<Project>/.planners/.doc-workbench/review-surface.json`。

## 1. 先校验，再按宿主模式打开

```bash
node "<B>/scripts/validate-bypage-doc.mjs" "<D>" [--assets "<Project>/.planners/by-page.assets.json"]
```

- **DSH 侧栏模式（推荐）**：
  ```bash
  node "<K>/scripts/doc-surface.mjs" "<D>"
  ```
  生成 surface 后调用 `review_open` 打开侧栏标签。第一次打开会补写缺失块锚点并生成/更新 `by-page.assets.json`（`doc-assets/1`）。
- **本地独立宿主模式（无 DSH 插件时）**：
  ```bash
  node "<K>/scripts/doc-workbench.mjs" "<D>" --open
  ```
  长驻服务启动后通过 `GET /api/doc` 验证读出 `pages` / `blocks`，即可将 URL 交给用户，不在用户操作期间轮询。

## 2. 接手批注与处理 `task.diff`

1. **取回任务**：
   - DSH：`node "<K>/scripts/doc-command.mjs" "<S>" tasks`
   - 本地：`GET /api/tasks`（或无插件轮询时 `node "<K>/scripts/doc-inbox.mjs" list "<D>"` / `take "<D>"`）
2. **先看 `task.diff`**：用户在工作台里直接增、删、改顺序后才提交批注时，`task` 会携带结构差异摘要（`diff`）。**先尊重人的最新页序与删增决定**，再围绕带锚点的块提交局部改稿，不恢复旧顺序。
3. **加锁、局部回写与完成**：
   - DSH：`claim <task_id>` → `patch`（stdin）→ `complete <task_id>`。
   - 本地：`POST /api/task/claim` → `POST /api/patch` → `POST /api/task/complete`。
   - 正文与来源被修改后，在关闭前或交付前务必重跑 `validate-bypage-doc.mjs` 并通知 `planners-fact-check` 复核受影响页与整稿。
4. **待核对冲突（`conflicts`）**：双方同时改动同一块时，工作台跳过覆盖并保留两个版本，交由用户在界面裁决（`mine` / `model` / `discard`），不代人拍板。
5. **自动保存边界**：工作台无手动保存按钮；自动保存不等于授权交付给 `$planners-ppt-hell`。
