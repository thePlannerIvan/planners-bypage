# 来源准备与独立事实核查

`<Skill>` 为 By-page 目录；`<I>` 为权威来源索引；`<D>` 为 `.planners/by-page.md`；`<F>` 为 `.planners/fact-audit.json`。都使用项目记忆中的绝对路径。

## 来源准备

先读 `planners-source-index/SKILL.md`，以其 schema 和公共校验器为准。沿用原索引、ID 和有效读取层，只补新增资料、必要补读及实际覆盖。`source_root` 相对索引目录，`audit_layer.path` 也相对索引目录，不能随阶段移动索引而不重定位。

```bash
node "<Skill>/scripts/prepare-audit-sources.mjs" --source-index "<I>"
node "<Skill>/scripts/validate-source-index.mjs" "<I>" --strict-files --stamp
```

预处理复用有效副本。二进制资料缺少可读层时主动使用文件抽取或 OCR 能力；仍不可读时记录尝试、盲区及对判断的影响。处理 errors，检查 warnings 和真实可读性。登记通过不表示已经理解原文；正文取材仍需读取相关上下文。来源变化后重新校验并更新标记，无变化不重建。

## 核查调用

读 `planners-fact-check/SKILL.md`，按其独立上下文与代理续接规则调用。提供 Skill、当前 `.planners/by-page.md`、权威索引、结果输出的四个路径；续检追加变化范围、既有核查记录和真实用户裁定。示意图文字源一并传入。等结果文件真实写入后读取疑点、覆盖和盲区。

```bash
node "<Skill>/scripts/validate-fact-audit.mjs" --audit "<F>" --copy "<D>" --allow-human-review true
```

这个薄适配器调用 Fact Check 公共校验器并核对当前稿绑定。文档版的页号按 `##` 页的交付顺序读取；旧逐页稿继续按页级 frontmatter 读取。`--allow-human-review true` 允许呈现已明确接受的事实边界，不绕过未处理错误。读取 `errors` 与 `human_review_required`；`valid` 是机械校验结果，不是语义核查结论。

核查员处理 pending；作者修正 confirmed 后续检；no_source 补证、撤除或取得真实具体的边界决定。accepted_with_caveat 必须有用户的具体理由，交付中保留相应限定。作者不能改审计 Hash 替代核查。核查、来源或图片变化后先重跑 `validate-bypage-doc.mjs`，再让用户回到工作台继续。

核查结论在对话里用一段话讲清；不要往正文加角标，也不要把 `fact-audit.json` 的字段抄进 `正文` 段或页末出处。
