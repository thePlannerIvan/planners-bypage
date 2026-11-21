# 事实核查接缝

Bypage 不自建或重复实现核查逻辑；核查规则与独立核查员由 `planners-fact-check` 拥有，Bypage 只负责准备审计输入与校验接缝输出。

## 准备与核查链路

1. **后台补全来源底账**：
   ```bash
   node "<B>/scripts/prepare-audit-sources.mjs" --source-index "<Project>/.planners/source-index.json"
   ```
   把 `source-index/2.1.0` 里已读且未建底账的 PDF / Office 文件自动抽成纯文本 `audit-sources/<source_id>.txt` 并记录 `derived_from_sha256`、`provenance` 与文本哈希。
2. **调用独立核查**：调用 `planners-fact-check`（代理复用规则按该 Skill 自身规定执行），传入 `<Project>/.planners/by-page.md` 与 `source-index.json`，生成 `<Project>/.planners/fact-audit.json`。
3. **校验接缝**：
   ```bash
   node "<B>/scripts/validate-fact-audit.mjs" --audit "<Project>/.planners/fact-audit.json" --copy "<Project>/.planners/by-page.md"
   ```
   接缝会验证：
   - `artifact.sha256` 是否与当前 `by-page.md` 字节一致（改稿或换图即失效，必须续检）；
   - `suspects[].location.page` 是否落在 `planners-doc/2` 的 `##` 交付页码范围内；
   - 是否存在未裁决项（`pending`）或交付阻塞项（`confirmed` / `no_source`）。

## 交付与正文规范

- `by-page.md` 正文中绝不写入「已核」「待核」等核查角标；结论统一写在 `.planners/fact-audit.json` 与对用户的汇报摘要中。
- 对外交付给 `$planners-ppt-hell` 时，只使用非阻塞状态（无 `confirmed` / `no_source`）的最新核查回执。
