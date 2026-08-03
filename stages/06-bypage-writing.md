# 06 By-page 写作

## 这一步在做什么

根据已批准的页面架构和逐页材料包，完成足以直接交给 PPT 制作者的逐页内容。

## 工作方式

完整读取 `references/bypage-writing.md`。按章节写作，但不要求逐章确认。每页先明确受众看完后应理解什么，再选择段落、列表、表格、图表、图片、流程、案例或模型等合适形式。

必须保留：

- 页面真正可见的完整内容；
- 图片路径、说明和语义作用；
- 表格的表头、单位、时间和口径；
- 图表的真实数据关系与读图结论；
- 必要的 Speaker Notes、Production Notes 与来源定位。

不要因为猜测版面放不下而删除关键内容；下游 `$planners-ppt-hell` 的 Layout 阶段负责上屏压缩、Notes、拆页和版式。

普通项目直接完成全稿。只有长稿、强参考风格或密度不确定时，才先写少量代表性样页，不设置强制样页门禁。

## 产物

按照 `templates/by-page.md`写入 `.bypage-work/bypage-draft.md`并运行 Validator。

```bash
node "<Skill>/scripts/validate-bypage.mjs" +  "<project>/.bypage-work/bypage-draft.md"
```

## 完成标准

- 语义完成：所有页面达到可制作颗粒度，没有摘要式空壳。
- 机器检查：页码、必要字段、必要章节、图片引用与占位语有效。
- Validator 不能证明：页面内容是否准确、有用、容量合理。
