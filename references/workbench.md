# 完整稿审阅与交付操作

先读 `planners-review-core/SKILL.md` 及 `references/content-review.md`。公共模组维护自动保存、历史版本和恢复的当前规则；By-page 维护文案映射、核查与制作交接。

以下 `<Skill>` 为 By-page 目录，`<D>` 为唯一正式稿，`<F>` 为核查结果，`<V>` 为资产清单，`<R>` 为审阅目录，`<M>` 为共享项目记忆。路径从项目记忆读取。

## 生成与打开

```bash
node "<Skill>/scripts/start-bypage-review.mjs" --copy "<D>" --audit "<F>" --assets "<V>" --review-dir "<R>" --kind final
```

DSH 有 `review_open` 时加 `--surface-only`，把返回的 surface 路径交给插件打开。`surface_ready` 只证明生成完成，打开以插件回执为准。其他环境由同一命令启动或复用本地宿主。读取回执的 review_context、canonical_path 和 workbench_head。

两种宿主均自动保存，刷新可继续，历史版本支持查看与恢复。当前实现可直接恢复同一基线版本；跨模型重建的旧基线可查看，恢复需模型对照合并。反馈任务与保存分开；浏览器提交反馈后若没有自动唤起模型，提醒用户回对话通知继续处理。

## 处理用户修改和任务

读取 `<R>/workbench/head.json` 与当前 `<D>`。直接编辑的内容已进入正式稿；page_mapping 表示重排后的页码。任务按页绑定：`pages` 是提交时的显示页号，`page_keys` 是本轮页身份，`page_hashes` 是那几页提交时的内容指纹，`page_versions` 是提交时用户编辑版本。处理前对照当前内容，`page_drift` 表示提交时磁盘上已变化的页；按范围完成修改、素材检查与必要续检。批注提交只校验页集合，模型改一页不妨碍用户提交另一页的批注。

标记完成不要求整份 revision/source_hash 相等（那会锁住整份文件）；`--revision` / `--source-hash` 仍被接受，只作记录。回执里的 `stale_pages` 表示提交后用户又改过那几页，要先重新读这些页再声明完成：

```bash
node "<Skill>/scripts/finish-review-task.mjs" --review-dir "<R>" --task-id "<task_id>"
```

保存与反馈按页生效：你改 A 页后，用户对 B 页的编辑仍会保存且保留 A 页的改动；同一页被双方改过时该页进入 `deferred_pages`，页面标“待核对”等人选择，不要覆盖用户草稿。任务回执异常时重新读取当前 head 再标一次，不直接清空任务。没有任务就不运行完成命令。核查结果或资产变化后也重建审阅，不能沿用旧依赖绑定。

## 用户上传图片

先将上传材料登记到原来源索引。按来源分别导入当前已保存的附件：

```bash
node "<Skill>/scripts/import-review-assets.mjs" --workbench "<R>" --manifest "<V>" --source-id "<来源ID>" --pages "1,3"
```

`--pages` 是当前页号；整批同源时可省略。若同页附件来自不同来源，分别明确其来源并登记到资产清单，不能用一次页级命令把它们都归为同源。导入会核对已保存状态，使用当前页码映射，拒绝越出上传目录的文件。读返回的 asset_id，实际检查图片后填写 visual_check；导入本身只登记 pending。正文保留真实图片引用，导出依据字节匹配资产。

## 导出制作快照

反馈已处理、核查与资产匹配当前稿后执行：

```bash
node "<Skill>/scripts/build-reviewed-copy.mjs" --copy "<D>" --audit "<F>" --workbench "<R>" --manifest "<V>" --output "<Project>/deliverable/by-page.md" --assets-dir "<Project>/deliverable/assets" --production-json "<Project>/deliverable/production.json" --memory "<M>"
```

有示意图时先按 [示意图流程](diagram-lifecycle.md) 检查源与渲染一致。有正在使用的工作结构或材料包时可加 `--architecture` / `--materials`；默认不要求它们。核对 valid、正文/制作说明图片路径和交付资产，在记忆记录 snapshot 和交付路径。交付件是当前稿的快照，继续修改仍回到 `<D>`。

## 仅恢复旧项目

明确使用旧反馈流程的项目才加 `--legacy-review true` 并使用 review-inbox、旧 feedback validator 和 `import-review-assets.mjs --feedback <旧反馈文件>`。当前 Workbench 不生成、不寻找 review-feedback.json 或 review-submissions.json。历史说明与兼容脚本不是新项目流程。
