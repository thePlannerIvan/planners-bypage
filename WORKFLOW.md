# Planners Bypage 工作流

## 项目目录

```text
<project>/
├── source/                         # 用户原始资料，名称可不同
├── .bypage-work/
│   ├── source-index.json
│   ├── project-memory.md
│   ├── content-brief.md
│   ├── copy-style-profile.md        # 本项目的语言基线（提案类稿件用；可选）
│   ├── page-architecture.json
│   ├── page-material-packs.json
│   ├── asset-manifest.json
│   ├── bypage-draft.md
│   ├── fact-audit.json
│   ├── audit-sources/               # PDF/Word/PPT 的机器审计文本副本
│   ├── assets/
│   │   ├── original/
│   │   ├── processed/
│   │   └── previews/
│   └── reviews/
│       ├── storyline/                 # 审阅面：index.html + review-surface.json
│       │   ├── review-submissions.json   # 宿主原样落盘的提交（收件的输入）
│       │   ├── review-feedback.json      # 本 Skill 的形状：最新一轮（agent 与 Validator 读它）
│       │   └── history/round-NN.json     # 只追加，永不覆盖
│       └── bypage/                    # 同上（另有 review_host.json / wake-log.jsonl，宿主自己的产物）
└── deliverable/
    ├── by-page.md
    └── assets/
        ├── original/
        ├── processed/
        └── asset-manifest.json
```

过程文件只放在 `.bypage-work/`。不要创建 conversation log、执行总结或第二套资产注册表。

## 状态路由

来源覆盖完成后，只进行一轮集中选择；不要拆成用途、范围和密度的多轮问卷。

本 Skill 有两条入口：

- **Proposal 交接**：读取上游的 `project-memory.md`、`source-index.json`、已批准 Storyline、`page-architecture.json` 和结构反馈。不得静默重建或改写上游判断；本 Skill 负责把它们展开成完整内容。
- **独立运行**：没有已批准 Storyline 时，才在本 Skill 内形成工作结构，并按需要取得用户确认。

| 当前证据 | 进入阶段 |
|---|---|
| 只有用户资料 | `stages/01-source-intake.md` |
| 来源覆盖完成，尚无集中选择 | `stages/02-content-decisions.md` |
| Content Brief 已确认，无页面架构 | `stages/03-storyline-architecture.md` |
| Proposal 已交出 Storyline 和结构参考 | `stages/03-storyline-architecture.md`，进入内容展开，不重建方向 |
| 独立运行的页面架构未审或有修改项 | `stages/04-storyline-review.md` |
| 内容展开完成，材料包或资产处理未完成 | `stages/05-page-materials-assets.md` |
| 材料包完成，无完整逐页稿 | `stages/06-bypage-writing.md` |
| 有逐页稿，事实审计或终审未批准 | `stages/07-fact-audit-review.md` |
| 终审批准，尚未生成交付 | `stages/08-delivery-handoff.md` |

人工反馈必须绑定当前输入 Hash；结构、文案、事实审计或资产选择变化时，相应旧批准失效。

## 运行环境降级

- Skill 自带的确定性脚本优先使用 Node.js，不为临时 JSON/文本处理额外生成 Python 脚本。
- 确需生成包含中文或其他非 ASCII 内容的临时脚本时，使用文件编辑工具写入 UTF-8 文件后再运行；不通过 shell heredoc 或多层引号直接喂给解释器。
- 不假定 `python`/`python3` 版本、默认编码、特定 vision 供应商或私有密钥路径存在。必须先读取当前环境可用能力；没有可靠视觉能力时转为用户在审阅页确认。

## 责任边界

- 文件能力负责真实读取、转换和媒体提取；不得只凭扩展名宣称已读。
- Source Index 负责覆盖、原文件 Hash、人工回查与机器审计副本绑定，不负责复制全部原文。
- 上游 Page Architecture 负责已批准的结构判断；独立运行时的 Page Architecture 负责工作结构。两者都不提前替代完整文案。
- 内容展开负责把判断发展成可写的页面论证；Material Pack 随后只收集这些页面实际需要的材料，不建立全库 Evidence Ledger。
- Asset Manifest 是唯一图片状态接口；Review 上传必须回写它。
- 事实审计只扫描终稿实际展示或说出的事实；人工定位保留原文件，机器定位自动读取绑定的审计副本。
- 审阅页由**审阅宿主**打开（有插件时 DSH 侧栏，没有时模组的本地宿主）；页面提交落 `review-submissions.json`，`scripts/review-inbox.mjs` 收件后翻译成 `review-feedback.json` 并只追加 `reviews/<kind>/history/round-NN.json`。

By-page 的完成不是“把 Storyline 复述一遍”，而是让每个页面拥有足够的事实、解释、关系和素材说明，能够交给 PPT 制作者继续处理版式。

## 运行后学习

只把会改变同项目后续运行的选择写回 `project-memory.md`。连续项目复现的缺陷才进入 Skill 改进；替换机制时删除旧路径，不保留活跃兼容分支。
