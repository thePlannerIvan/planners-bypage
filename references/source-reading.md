# 来源阅读与盲区登记

所有多源项目资料的定位、已读范围、可信度等级（`provenance`）与未读盲区一律使用 `planners-source-index` 的 **`source-index/2.1.0`** 契约，登记于 `<Project>/.planners/source-index.json`。

## 两阶段接力原则

1. **承接上游 Proposal 台账**：若 `<Project>/.planners/source-index.json` 已由 `planners-proposal` 建立，直接沿用并补全进入完整文案所需的细节锚点与新补充材料；不覆写已有 `blind_spots` 或真实缺失记录。
2. **补全深层审计副本（`audit_companion`）**：
   - 运行 `node "<B>/scripts/prepare-audit-sources.mjs" --source-index "<Project>/.planners/source-index.json"`，为重点 PDF / Office 文档抽取按页或版面保留的纯文本副本（`.planners/audit-sources/<source_id>.txt`），以便 `planners-fact-check` 逐页回查；
   - 确保每条有效来源都标注了 `provenance`（`primary` / `secondary` / `derived` / `unverified`）与诚实的 `coverage`（`full` / `partial` / `unread`）。
3. **格式校验**：每次修改或抽取后运行 `node "<B>/scripts/validate-source-index.mjs" "<Project>/.planners/source-index.json"`。
