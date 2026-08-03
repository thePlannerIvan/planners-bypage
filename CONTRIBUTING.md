# Contributing

感谢你帮助改进 Planners Bypage。

## 开发环境

- Node.js 20+；
- 安装依赖：`npm ci`；
- 运行公开验证：`npm test`。

## 提交变更

请在 PR 中说明：

1. 真实用户场景和当前失效方式；
2. 修改的 Stage、Contract、生成脚本、消费脚本和 Eval；
3. `npm test` 的结果；
4. 是否完成真实语义 Forward Test，以及观察到的非测试夹问题。

新增字段或机制必须有真实消费者；替换旧机制时，同步删除失效规则、脚本、Contract、样例和 Eval。修改 Contract 时，生成端、审阅页、反馈消费端、Validator 和文档必须同步升级。

## 测试资料

只提交已脱敏、可再分发的最小复现材料。不要提交客户文档、内部日志、访问凭证、真实项目交付包或 `.bypage-work/`。
