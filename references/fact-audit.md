# 最终事实审计

## 审计来源

Material Pack 始终引用原始 Source ID。PDF、Word、PPT 的人工定位保留原文件页码或幻灯片号；脚本通过 Source Index 的 `audit_companion`自动读取机器文本，不建立第二套来源。

## 衍生数字

衍生公式必须是结构化对象，不能写成字符串：

```json
{
  "operands": [47.9, 37.3],
  "operator": "divide",
  "displayed_value": 1.28,
  "comparison": "equal",
  "tolerance": 0.01
}
```

支持 `add`、`subtract`、`multiply`、`divide`与`inclusive_range_count`。操作数在同一事实或来源中可定位时无需额外字段；跨句引用时增加与 `operands`一一对应的 `operand_refs`，值为当前 Audit 中真实存在的 `token_id`。不要为了通过校验把来源事实改成衍生事实，或把衍生事实改成非事实。

## 表格和符号

- 表格保留完整行、表头、单位和来源中的正负号；方向箭头不能替代负号。
- `sign_mismatch`表示来源中找到绝对值相同但符号相反的数字，应修正文案或回查原表，不使用符号容差放行。
- 跨语言数字转写、来源四舍五入或机器文本缺失的少量项目可以进入人工例外，但必须说明具体原因。
