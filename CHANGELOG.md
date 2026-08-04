# Changelog

## 1.2.0 — 2026-08-04

### Added

- 事实审计 CLI 的 `--help` 与状态感知 `--next`，包含完整参数模板。
- 来源反推的独立归属队列，逐数字展示机器命中的原文片段。
- Storyline 与 By-page 反馈的 `history/round-NN.json` 轮次留档。
- 无原生视觉、未知 Python 环境和多语言临时脚本的降级指引。

### Changed

- `confirm` 只自动确认方案数字和非事实编号；来源/衍生事实必须经过 `resolve` 独立核对。
- 审计策略升级为 `source-first-attribution/1.2.0`，旧语义批准会自动失效并要求重查。

### Fixed

- 行首列表编号导致同句后续事实数字被误标为 `non_factual`。
- 历史性“从 A 提升到 B”和“增长 C”在没有目标/建议语气时被误标为 `planned_value`。
- `confirm`/`--next` 将待归属事实错误降级为无独立检查清单的阻断项。

## 1.1.0 — 2026-08-03

- 首个公开版本。
- 包含 Source Index 1.1、二进制文档审计副本、图片视觉门禁、两轮 HTML Review、事实审计和 `planners-ppt-hell` 交付衔接。
