# 08 交付与 PPT 制作衔接

## 这一步在做什么

只从当前批准版本生成干净交付，并把工作交给 PPT 制作 Skill。

## 工作方式

验证终审整体批准、事实审计有效、所有本地图片路径存在、Asset Manifest 覆盖全部引用。复制采用图片的原图与处理图，重写正文及 Production Notes 中的登记资产路径，并对交付 Manifest 再验一次双 Hash 与视觉状态。

```text
deliverable/
├── by-page.md
└── assets/
    ├── original/
    ├── processed/
    └── asset-manifest.json
```

完整 Source Index、材料包、审计和 Review 留在 `.bypage-work/`，不进入客户交付。

```bash
node "<Skill>/scripts/build-reviewed-copy.mjs" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --feedback "<project>/.bypage-work/reviews/bypage/review-feedback.json" +  --manifest "<project>/.bypage-work/asset-manifest.json" +  --output "<project>/deliverable/by-page.md" +  --assets-dir "<project>/deliverable/assets"
```

## 下游提示

明确告诉用户：

> 逐页内容与图片资产已经准备完成。下一步请使用 `$planners-ppt-hell`，把 `deliverable/by-page.md` 制作为可编辑 PowerPoint。

若未安装，提供 GitHub 安装命令；本 Skill 不自行进入模板、Layout、SVG 或 PPTX 导出。

## 完成标准

- 交付只包含 By-page 和被引用资产；
- 图片路径相对交付文件有效；
- 下游可以重新登记图片，不丢失语义作用和来源说明。
