# 04 Storyline 图文审阅

使用公共内容审阅壳：章节连续阅读，文字点击修改，章节与页面目录可拖动排序。草稿落盘不等于批准；确认后先由 inbox 保留原稿并写回本 Skill 的结构契约，反馈绑定修改后的 Hash，再判门。用户修改优先于模型旧稿；原文冲突时不覆盖。Proposal 已批准的交接路径仍不重复这一步。

## 这一步在做什么

让用户一次审阅整条 Storyline、页序、页面任务和候选图片。

## 工作方式

页面完整展示章节与页级任务，工程字段折叠；每页显示推荐 1–3 张图片，其他候选折叠，并允许采用、备用、排除、替换或上传。**页面由审阅宿主打开**（别用手开 `index.html`：页面靠宿主注入的桥说话）。

```bash
# 有插件（宿主有 review_open 工具）：只写审阅面并报出绝对路径，交给那个工具 —— 不起本地宿主
node "<Skill>/scripts/start-storyline-review.mjs" +  --architecture "<project>/.bypage-work/page-architecture.json" +  --assets "<project>/.bypage-work/asset-manifest.json" +  --review-dir "<project>/.bypage-work/reviews/storyline" +  --surface-only

# 没有插件：同一个脚本起本地宿主并自动打开浏览器
node "<Skill>/scripts/start-storyline-review.mjs" +  --architecture "<project>/.bypage-work/page-architecture.json" +  --assets "<project>/.bypage-work/asset-manifest.json" +  --review-dir "<project>/.bypage-work/reviews/storyline" +  --port 0
```

普通页面默认通过；输入任何页面反馈或改变图片状态后自动切换为需要修改。上一轮被人标了「需要修改」的页、以及人上一轮选过的图片状态，重出审阅页后**都带回来**（分别是"待复核"和人选的那个状态），不被生成器的候选分组覆盖。保存后让用户回到对话发送“已完成”。

收到反馈后（**先收件，再判门**）：

```bash
node "<Skill>/scripts/review-inbox.mjs" +  --surface "<project>/.bypage-work/reviews/storyline/review-surface.json"
```

收据按面给**下一步**（读这三样）：`units`（`{count, label}` —— 这一轮收了多少个单元、它叫什么）、
`next_action_zh`（storyline 指 `validate-storyline-review-feedback.mjs` + 本文档；逐页面指 `validate-review-feedback.mjs` + `stages/07`）、
`imported.round`（这一轮追加成 `history/round-NN.json` 的名字）。

1. 验证反馈绑定当前 Architecture Hash；
2. 将上传图片正式写入 Asset Manifest，不只保留为附件；
3. 根据反馈修改 Storyline、页序、页面任务与图片分配；
4. 有修改时重新生成并审阅；整体批准后进入 Stage 05。

```bash
node "<Skill>/scripts/validate-storyline-review-feedback.mjs" +  --feedback "<project>/.bypage-work/reviews/storyline/review-feedback.json" +  --architecture "<project>/.bypage-work/page-architecture.json" +  --assets "<project>/.bypage-work/asset-manifest.json"

node "<Skill>/scripts/import-review-assets.mjs" +  --feedback "<project>/.bypage-work/reviews/storyline/review-feedback.json" +  --manifest "<project>/.bypage-work/asset-manifest.json" +  --source-id "src-user-review"
```

收件把页面提交（`review-submissions.json`）翻译回本 Skill 的形状：`review-feedback.json` 始终表示最新一轮，同时**只追加**一份 `reviews/storyline/history/round-NN.json`（既有轮次逐字节不动，方向性反馈即使已被后续版本吸收也留着回查）。

只有反馈实际含上传图片时才运行 import；随后由模型把返回的 Asset ID 分配到 Architecture。

## 完成标准

- 语义完成：用户看到了完整结构和关键图片选择，并批准当前版本。
- 机器检查：反馈覆盖页面、Hash 一致、图片状态与路径合法。
- Validator 不能证明：用户是否真正认同结构内容。
