# 01 材料接收与覆盖

## 这一步在做什么

完整理解输入范围，建立后续可以回查的事实与图片基础。

## 输入及其作用

- Word、PDF、Markdown、PPT、表格：提供正文、数据、结构和嵌入素材。
- 独立图片：提供内容证据、品牌资产或参考视觉。
- 用户描述：补充目标与限制，不代替材料阅读。

## 判断框架

1. 先发现全部文件、版本、大小和格式，再读 Brief、目录、会议决定等边界材料。
2. 区分第一方事实、原始数据、他人分析、历史答案、模型推论和未知。
3. 大型表格可查看字段、范围与代表切片，但必须记录实际覆盖；主要分析报告与改变方向的内容应完整读取。
4. 图片按内容证据、叙事素材、品牌资产、参考素材、装饰噪声和待判断分类。不要把小 Logo、页眉碎片或重复背景当作内容图。
5. 冲突材料保留双方原意，不擅自选边；不可读文件说明原因和影响。

## 工作方式

使用对应 PDF、Word、PPT、Spreadsheet 和图像能力完成真实读取与提取。脚本只负责清单、Hash、机器审计文本、尺寸、重复和格式状态。完整读取 `references/source-reading.md`；有图片时同时读取 `references/image-lifecycle.md`。

从 `templates/source-index.json` 和 `templates/asset-manifest.json` 开始。**来源索引的契约不在本 Skill 里** —— 它的字段与校验规则都在公共模组 `planners-source-index`（`contracts/source-index.schema.json`，`source-index/2.0.0`）；`asset-manifest` 仍是本 Skill 自己的契约（`contracts/asset-manifest.schema.json`）。写入 `.bypage-work/source-index.json`、`project-memory.md`与`asset-manifest.json`。先运行审计源预处理，再运行 Validator：

```bash
node "<Skill>/scripts/prepare-audit-sources.mjs" --source-index "<project>/.bypage-work/source-index.json"
node "<Skill>/scripts/validate-source-index.mjs" "<project>/.bypage-work/source-index.json"
```

> 这个脚本是**薄壳**：它按名字找到公共模组再把校验转过去。规则不在这里 —— 要改校验规则，改 `planners-source-index`，不要改本 Skill。
node "<Skill>/scripts/validate-asset-manifest.mjs" "<project>/.bypage-work/asset-manifest.json"
```

预处理脚本为 PDF、Word、PPT 在 `.bypage-work/audit-sources/`生成并绑定机器可读副本，原文件仍是人工引用来源。扫描 PDF 没有文本层时，用 PDF/OCR 能力生成同目录文本并补齐 `audit_companion`；不要把衍生 TXT 放在项目根目录，也不要让 Material Pack 改指第二个伪来源。

此时只生成 contact sheet 或预览供模型覆盖；除非存在高影响歧义，不把全部图片交给用户逐张判断。

## 不要做什么

- 不讨论 Storyline。
- 不把文件存在等同于已读。
- 不因为文本提取成功而忽略图表、扫描页和嵌入图片。
- 不预处理全部图片。

## 人机介入

只在主版本、材料冲突或关键文件不可读且继续检索无法解决时询问；其余选择集中到 Stage 02。

## 完成标准

- 语义完成：能说明每份材料回答什么、冲突在哪里、哪些图片可能承担内容作用。
- 机器检查：来源 ID、原文件与审计副本 Hash、覆盖状态、图片 ID、Hash 和文件存在性有效。
- Validator 不能证明：材料是否真正读懂、图片分类是否恰当。
