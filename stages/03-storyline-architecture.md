# 03 Storyline 与页面架构

## 这一步在做什么

把已确认的内容目标组织成认知推进，并按证明负担展开为实际页面。

## 判断框架

1. 从最终希望受众理解、相信或采取的行动反推必要前提。
2. 先建立 Storyline 节点，再列出每个节点“凭什么成立”。
3. 把事实、比较、机制、案例、图表、图片和行动等证明材料组成一页可理解的独立单元。
4. 一个 Storyline 节点可以展开多页；一页也可以由多个材料共同完成一个任务。
5. 页面可以是封面、目录、章节、判断、解释、数据、案例、流程、图解、引用、总结、行动或附录，不强迫每页成为策略观点。
6. 检查必须内容、重复、过载、附录边界和主张强度。

## 图片候选

从 Asset Manifest 中为每页推荐 1–3 张最相关图片，记录语义作用与来源语境；其他可能相关图片放入折叠候选。此时不决定最终裁剪和版式。

## 产物

按照 `contracts/page-architecture.schema.json`写入 `.bypage-work/page-architecture.json`并验证。它是给 Review、材料包和 By-page 使用的语义骨架，不是提前写好的文章。

```bash
node "<Skill>/scripts/validate-page-architecture.mjs" +  "<project>/.bypage-work/page-architecture.json" +  --assets "<project>/.bypage-work/asset-manifest.json"
```

## 不要做什么

- 不重新打开 Stage 02 已确认的价值选择。
- 不把 Storyline 句子机械改写成同数量页面。
- 不把布局、模板和裁剪字段塞入页面架构。

## 完成标准

- 语义完成：Storyline 推进自然，每页有一个主要任务和完整证明需求。
- 机器检查：页码连续、章节引用、Asset ID 和内容块形状有效。
- Validator 不能证明：顺序是否有说服力、页面是否真正必要。
