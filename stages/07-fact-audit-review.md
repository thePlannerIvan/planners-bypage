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
- 所有来源事实和衍生事实都进入“来源反推”归属队列；`confirm` 只能批量确认不涉及外部归属的方案数字和非事实编号。

不得绕过 Material Pack 做全库数字碰撞，也不得手写机械通过状态。

```bash
node "<Skill>/scripts/audit-final-copy.mjs" +  --mode prepare +  --copy "<project>/.bypage-work/bypage-draft.md" +  --source-index "<project>/.bypage-work/source-index.json" +  --materials "<project>/.bypage-work/page-material-packs.json" +  --source-root "<真实来源根目录>" +  --audit "<project>/.bypage-work/fact-audit.json"
```

完整状态序列是：

```text
prepare → confirm → resolve → check
```

- `prepare`：生成 Audit 和 `fact-audit-review-queue.json`，其中每个来源数字都绑定机器命中的原文片段；
- `confirm`：仅自动确认方案数字、页码、列表编号等低归属风险项；
- `resolve`：在独立归属上下文中只读 Review Queue 及它引用的原文片段，不重读或凭记忆使用 `bypage-draft.md`。逐条反向核对主体/公司名、指标对象、时间、单位、适用范围、层级和正负号，再把决定写入 `fact-audit-decisions.json`；
- `check`：最后重建并复算当前文案，确认可以进入 By-page Review。

任意时刻不确定下一步时，运行：

```bash
node "<Skill>/scripts/audit-final-copy.mjs" --next --audit "<project>/.bypage-work/fact-audit.json"
```

无参数或 `--help` 会返回完整模式、必需参数和命令模板。文案修改后重新 `prepare`。

## By-page Review

事实审计达到 `valid`或仅含 `requires_human_review`例外后，自动打开 Review。完整显示正文、表格、图片、原图/处理图关系、来源折叠信息、图片异常和事实例外。允许逐页修改、替换或上传图片。

上传图片必须在返修时正式进入 Asset Manifest、Material Pack 和 By-page。文案、事实或图片变化后重新审计并使旧批准失效。

```bash
node "<Skill>/scripts/start-bypage-review.mjs" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --assets "<project>/.bypage-work/asset-manifest.json" +  --review-dir "<project>/.bypage-work/reviews/bypage" +  --final-md "<project>/deliverable/by-page.md" +  --kind final +  --port 0

node "<Skill>/scripts/validate-review-feedback.mjs" +  --feedback "<project>/.bypage-work/reviews/bypage/review-feedback.json" +  --copy "<project>/.bypage-work/bypage-draft.md" +  --audit "<project>/.bypage-work/fact-audit.json" +  --kind final
```

`review-feedback.json` 保留最新终审；每次保存同时追加到 `reviews/bypage/history/round-NN.json`。返修后的新终审不得覆盖前一轮反馈。

终审上传图片存在时，先运行 `import-review-assets.mjs`，再更新 Material Pack 与 By-page 并重新审计、重审。

## 完成标准

- 语义完成：用户批准当前完整图文版本，事实例外有明确决定。
- 机器检查：Copy、Audit、Asset Manifest 与 Feedback Hash 一致，所有引用图片存在。
