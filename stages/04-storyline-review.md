# 04 Storyline 图文审阅

## 这一步在做什么

让用户一次审阅整条 Storyline、页序、页面任务和候选图片。

## 工作方式

运行 Storyline Review Builder 和 Review Server。页面完整展示章节与页级任务，工程字段折叠；每页显示推荐 1–3 张图片，其他候选折叠，并允许采用、备用、排除、替换或上传。

```bash
node "<Skill>/scripts/start-storyline-review.mjs" +  --architecture "<project>/.bypage-work/page-architecture.json" +  --assets "<project>/.bypage-work/asset-manifest.json" +  --review-dir "<project>/.bypage-work/reviews/storyline" +  --port 0
```

普通页面默认通过；输入任何页面反馈或改变图片状态后自动切换为需要修改。保存后让用户回到对话发送“已完成”。

收到反馈后：

1. 验证反馈绑定当前 Architecture Hash；
2. 将上传图片正式写入 Asset Manifest，不只保留为附件；
3. 根据反馈修改 Storyline、页序、页面任务与图片分配；
4. 有修改时重新生成并审阅；整体批准后进入 Stage 05。

```bash
node "<Skill>/scripts/validate-storyline-review-feedback.mjs" +  --feedback "<project>/.bypage-work/reviews/storyline/review-feedback.json" +  --architecture "<project>/.bypage-work/page-architecture.json" +  --assets "<project>/.bypage-work/asset-manifest.json"

node "<Skill>/scripts/import-review-assets.mjs" +  --feedback "<project>/.bypage-work/reviews/storyline/review-feedback.json" +  --manifest "<project>/.bypage-work/asset-manifest.json" +  --source-id "src-user-review"
```

只有反馈实际含上传图片时才运行 import；随后由模型把返回的 Asset ID 分配到 Architecture。

## 完成标准

- 语义完成：用户看到了完整结构和关键图片选择，并批准当前版本。
- 机器检查：反馈覆盖页面、Hash 一致、图片状态与路径合法。
- Validator 不能证明：用户是否真正认同结构内容。
