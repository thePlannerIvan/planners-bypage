# 05 逐页材料包与图片处理

## 这一步在做什么

为每页回到真实来源准备足够材料，并只处理已经采用或保留备用的图片。

## 逐页材料包

从 `templates/page-material-packs.json`开始，按 `contracts/page-material-packs.schema.json`建立机器接口。对每页查找支持和相反材料，记录原文、页码、Sheet、单元格、数据切片、口径、内容块用途、缺口和影响。只收集实际页面需要的内容，不建立全库 Evidence Ledger。

- 来源推翻核心页面任务：返回 Stage 03。
- 只影响措辞强度：降低结论并记录原因。
- 关键证据图缺失：标记阻塞或替换。
- 只缺装饰图：不阻塞内容写作。

## 图片处理

完整读取 `references/image-lifecycle.md`。默认只做去重、方向修正、格式归一、预览、清晰度检查和无意义空白边处理。只有特定图片确有必要时，才从截图裁出对象、拆分组合图或改善可读性；必须保留原图，并分别记录原图与处理图 Hash。

对所有采用或备用图片完成内容视觉检查：确认它确实是目标图、主体和坐标轴没有裁掉、多张图没有误重复、文字在审阅尺寸下可读。能直接看图时必须直接看；只能做像素统计时不得标记 `passed`，应先取得用户确认。把检查方法和结论写入 `visual_check`。

若当前模型没有原生视觉，先使用环境已提供的图像查看或 vision 能力读取原图/预览图；不要假定特定厂商、密钥文件或模型必然存在。如环境完全无可用视觉能力，将 `visual_check.status` 保持为 `pending` 并在 Storyline/By-page Review 明确请用户确认，不得用 OCR、尺寸、坐标或文件名伪装内容视觉通过。

不决定下游 Layout 的裁剪比例、锚点或槽位。

## 产物

- `.bypage-work/page-material-packs.json`
- 更新后的 `.bypage-work/asset-manifest.json`
- `.bypage-work/assets/original|processed|previews/`

```bash
node "<Skill>/scripts/validate-page-materials.mjs" +  --materials "<project>/.bypage-work/page-material-packs.json" +  --architecture "<project>/.bypage-work/page-architecture.json" +  --sources "<project>/.bypage-work/source-index.json" +  --assets "<project>/.bypage-work/asset-manifest.json"

node "<Skill>/scripts/validate-asset-manifest.mjs" +  "<project>/.bypage-work/asset-manifest.json" --final
```

## 完成标准

- 语义完成：每页可快速回到来源，关键反例与图片语境已暴露。
- 机器检查：Material Pack 覆盖全部页面，来源与 Asset ID 有效，原图/处理图 Hash 有效，采用图片已有视觉检查记录。
