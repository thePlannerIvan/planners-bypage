# Planners Bypage 工作流

## 项目目录

```text
<project>/
├── source/                         # 用户原始资料，名称可不同
├── .bypage-work/
│   ├── source-index.json
│   ├── project-memory.md
│   ├── content-brief.md
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
│       ├── storyline/
│       └── bypage/
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

| 当前证据 | 进入阶段 |
|---|---|
| 只有用户资料 | `stages/01-source-intake.md` |
| 来源覆盖完成，尚无集中选择 | `stages/02-content-decisions.md` |
| Content Brief 已确认，无页面架构 | `stages/03-storyline-architecture.md` |
| 页面架构未审或有修改项 | `stages/04-storyline-review.md` |
| 结构批准，材料包或资产处理未完成 | `stages/05-page-materials-assets.md` |
| 材料包完成，无完整逐页稿 | `stages/06-bypage-writing.md` |
| 有逐页稿，事实审计或终审未批准 | `stages/07-fact-audit-review.md` |
| 终审批准，尚未生成交付 | `stages/08-delivery-handoff.md` |

人工反馈必须绑定当前输入 Hash；结构、文案、事实审计或资产选择变化时，相应旧批准失效。

## 责任边界

- 文件能力负责真实读取、转换和媒体提取；不得只凭扩展名宣称已读。
- Source Index 负责覆盖、原文件 Hash、人工回查与机器审计副本绑定，不负责复制全部原文。
- Page Architecture 负责页面任务，不提前写成全文或决定版式。
- Material Pack 只收集实际页面需要的材料，不建立全库 Evidence Ledger。
- Asset Manifest 是唯一图片状态接口；Review 上传必须回写它。
- 事实审计只扫描终稿实际展示或说出的事实；人工定位保留原文件，机器定位自动读取绑定的审计副本。

## 运行后学习

只把会改变同项目后续运行的选择写回 `project-memory.md`。连续项目复现的缺陷才进入 Skill 改进；替换机制时删除旧路径，不保留活跃兼容分支。
