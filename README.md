# Planners Bypage

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Tests](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml/badge.svg)](https://github.com/thePlannerIvan/planners-bypage/actions/workflows/validate.yml)

**把定好调的 Storyline 或杂乱的一堆原始资料，变成适合编程 PPT 的逐页完整文案（`by-page.md`）、做完独立事实核查，并在实时文字工作台打磨定稿后直接交接给 `planners-ppt-hell`。**

> 作者：阿祖不看 TVC（小红书同名）· [demyth.info](https://demyth.info) · [Lawyif@163.com](mailto:Lawyif@163.com)

---

## 核心链路：两件事做到位

1. **写出适合编程 PPT 的逐页稿（`.planners/by-page.md`）**：结合 [`slide-copy`](https://github.com/thePlannerIvan/slide-copy) 与 [`planners-method-wiki`](https://github.com/thePlannerIvan/planners-method-wiki) 的「页面表达结构」，把每页展开为结构清晰、单位与口径明确的 `正文 / 口播 / 制作` 三段与页末 `>` 来源出处。
2. **后台深抽检与独立事实核查**：把重点 PDF / Office 报告自动抽建审阅底账（`source-index/2.1.0`），交给独立的 [`planners-fact-check`](https://github.com/thePlannerIvan/planners-fact-check) 严查每一条数据、主体与时间引用，并通过 `planners-review-core` 工作台与人对齐最终文案后直接交给 [`planners-ppt-hell`](https://github.com/thePlannerIvan/planners-ppt-hell)。

```text
planners-proposal (.planners/storyline.md) 或 原始项目资料
  → 1. import-storyline-doc.mjs 导入骨架 & prepare-audit-sources.mjs 补齐底账
  → 2. 查 Method Wiki 页面表达结构 + slide-copy 写成可编程 PPT 的 by-page.md
  → 3. 独立 planners-fact-check 核查 → validate-fact-audit.mjs 门禁
  → 4. 打开实时文字工作台（DSH 侧栏 / 本地浏览器）多轮块级修改（含 task.diff）
  → 5. 直接交给 planners-ppt-hell（init_svg_project.py --source 自动解析 by-page.md）
```

---

## 快速校验与测试

```bash
npm test
node scripts/validate-bypage-doc.mjs "<Project>/.planners/by-page.md"
node scripts/validate-fact-audit.mjs --audit "<Project>/.planners/fact-audit.json" --copy "<Project>/.planners/by-page.md"
```

---

## 开源与授权

- **许可协议**：[GNU Affero General Public License v3.0](LICENSE)。
- **署名边界**：过程文档与工作台保留来源识别，默认不得写入客户最终 PPT；详见 [TRADEMARK.md](TRADEMARK.md) 与 [NOTICE](NOTICE)。
- **商业支持**：联系 `Lawyif@163.com` 或访问 [demyth.info](https://demyth.info)，详见 [COMMERCIAL.md](COMMERCIAL.md)。
