# 工作台操作

先读 `planners-review-core/contracts/planners-doc-task.md` 与 `contracts/planners-doc.md`。公共模组维护文档结构、块级保存、锁、待核对与反馈任务；By-page 维护写什么、来源与核查。

以下 `<Skill>` 为 Bypage 目录，`<D>` 为 `.planners/by-page.md`，`<F>` 为 `.planners/fact-audit.json`，`<I>` 为权威 `source-index.json`，`<M>` 为共享项目记忆。路径从项目记忆读取。

## 打开

```bash
node "<planners-review-core>/scripts/doc-workbench.mjs" "<D>" --open
```

工作台按块读出文档，点进任意块就地编辑，自动保存，没有手动保存按钮。第一次打开会补写缺失锚点、按正文重建同名图片清单 `by-page.assets.json`；两者都是正常落盘，不是内容改动。保存后先重跑 `validate-bypage-doc.mjs`，再重新打开工作台。

两种宿主共用同一份文档与同一套命令面：本地浏览器宿主与 DSH 侧栏。侧栏接入不改变文档格式；页面刷新前的未保存编辑留在草稿里。

## 编辑与结构

- 点哪写哪；回车分块，删空合并。块内支持加粗、斜体、行内代码与链接。
- 拖块尾六点句柄移动块，拖页标题移动整页，也可 `Alt+↑↓`；页号由顺序决定，不写进正文。
- 历史按次记录，可查看与恢复；恢复作为一次新编辑保存，旧记录不抹。
- 图块就地显示，点击放大；取不到时标「未能加载」，不编造。

## 块级反馈与派发

- 选中文字自动吸附到完整块；提交的是块身份与提交时的内容指纹，不是整份全文。
- 块尾批注按钮、选中浮出按钮、顶部整体反馈（整页 / 整份）走同一个任务形状。
- 派发只表示「请求模型改这些块」，不是保存，也不是批准。
- 有侧栏插件时即时唤醒模型；没有插件时任务落进 `<D 所在目录>/.doc-workbench/inbox/`，模型用公共命令读取：

```bash
node "<planners-review-core>/scripts/doc-inbox.mjs" list "<D>"
node "<planners-review-core>/scripts/doc-inbox.mjs" take "<D>"
```

## 处理用户修改和任务

读取当前 `<D>`、`GET /api/tasks`（或收件箱）与 `.doc-workbench/` 下的任务文件。任务按块绑定：`blocks[].anchor` 是块身份，`blocks[].sha256` 是提交那一刻的内容指纹。按这些块处理，不重写全文：

1. `POST /api/task/claim` 开始处理；这些块被锁，人仍可编辑其他块。
2. 修改后 `POST /api/patch` 逐块写回。指纹一致才落盘；块已被人改过则进「待核对」，磁盘不动，其余块照常应用。
3. 没有待核对时 `POST /api/task/complete` 收尾；有 `review` 状态时等人 `POST /api/conflict/decide` 裁决 `mine` / `model` / `discard`。

同一块同时被人和模型改过，只有该块进待核对并保持锁定；不要静默覆盖任何一版。工作台没开时允许直接改 `<D>`，下次打开以磁盘为准；改完先跑校验器。

## 图片

- 正文引用决定用哪张图：`![说明](相对路径)`；清单只记录文件当前字节与绑定的块。
- 换图走 `POST /api/asset/replace`，请求只有块身份、字节与基线；引用路径不变。锁定的图块不可换。
- 模型直接换文件也可以：下次打开时按磁盘重新登记新指纹。SVG 与位图一样按 `<img>` 加载。
- 上传素材先登记到来源索引，再做真实视觉检查；清单只证明文件字节，不证明图的内容正确。

## 交付

交付前确认：`validate-bypage-doc.mjs` 通过、`validate-fact-audit.mjs --audit "<F>" --copy "<D>" --allow-human-review true` 没有未处理错误、图片清单与正文一致。把当前 `<D>`、`<F>`、`by-page.assets.json`、来源索引与项目记忆的绝对路径记入项目记忆。

当前仓库的 `build-reviewed-copy.mjs` / `review-inbox.mjs` / `import-review-assets.mjs` 仍服务旧页级逐页稿与旧审阅面；新 `.planners/by-page.md` 的 PPT Hell 导入适配是独立的一张票，未完成前不假装已经导出。

## 旧项目

页级 frontmatter 的 `bypage-draft.md`、`asset-manifest.json` 与 `reviews/bypage/` 只用于已有项目续接：继续用 `start-bypage-review.mjs`、`review-inbox.mjs` 和旧 feedback validator。新项目不生成、不寻找 `review-feedback.json` 或 `review-submissions.json`。
