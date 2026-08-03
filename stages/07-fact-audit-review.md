# 07 事实审计与 By-page 审阅

## 这一步在做什么

冻结逐页稿，只核对最终实际展示或说出的数字事实，并提交完整图文终审。

## 事实审计

完整读取 `references/fact-audit.md`，复用逐页材料包和 Source Index：

- 枚举数字、比例、金额、日期、样本量、引用、表格值和计算结果；
- Excel 回到真实 Sheet 与单元格；
- 区分来源事实、衍生事实、建议/目标数字和非事实编号；
- 衍生事实必须可复算；
- 文案变化后只重查变化项；
- 来源缺失、未分类和计算错误保持阻断；
- 来源明确但机器无法裁决的少数事实交给用户明确选择；PDF、Word、PPT 不得因为格式本身批量进入例外。

不得绕过 Material Pack 做全库数字碰撞，也不得手写机械通过状态。

```bash
node "<Skill>/scripts/audit-final-copy.mjs" +  --mode prepare +  --copy "<project>/.bypage-work/bypage-draft.md" +  --source-index "<project>/.bypage-work/source-index.json" +  --materials "<project>/.bypage-work/page-material-packs.json" +  --source-root "<真实来源根目录>" +  --audit "<project>/.bypage-work/fact-audit.json"
```

模型只处理生成的短 Review Queue，把语义决定写入 `fact-audit-decisions.json`，再运行 `--mode resolve --decisions <path>`。文案修改后重新 prepare；准备打开终审前运行 `--mode check`。

## By-page Review

事实审计达到 `valid`或仅含 `requires_human_review`例外后，自动打开 Review。完整显示正文、表格、图片、原图/处理图关系、来源折叠信息、图片异常和事实例外。允许逐页修改、替换或上传图片。

上传图片必须在返修时正式进入 Asset Manifest、Material Pack 和 By-page。文案、事实或图片变化后重新审计并使旧批准失效。

```bash
node "<Skill>/scripts/start-bypage-review.mjs" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --assets "<project>/.bypage-work/asset-manifest.json" +  --review-dir "<project>/.bypage-work/reviews/bypage" +  --final-md "<project>/deliverable/by-page.md" +  --kind final +  --port 0

node "<Skill>/scripts/validate-review-feedback.mjs" +  --feedback "<project>/.bypage-work/reviews/bypage/review-feedback.json" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --kind final
```

终审上传图片存在时，先运行 `import-review-assets.mjs`，再更新 Material Pack 与 By-page 并重新审计、重审。

## 完成标准

- 语义完成：用户批准当前完整图文版本，事实例外有明确决定。
- 机器检查：Copy、Audit、Asset Manifest 与 Feedback Hash 一致，所有引用图片存在。
