# 42 — JSON Resume 双向适配

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：18（结构化内容）、26（中文特有字段）
- **Blocks**：41（MCP 需要 JSON 形态）
- **ADR**：[ADR-0003](../../../docs/adr/0003-structured-content-model.md)

## 背景

**JSON Resume v1.0.0** 是简历数据的开放标准，生态里有 **52 套社区主题**（`jsonresume-theme-*` npm 包）。

其 schema 的关键属性：**`additionalProperties: true`**——允许出现 schema 未定义的字段。

**这就是中文特有字段可以无损通过的原因**（ADR / Q16 的决策）：导出为合法 `resume.json` 的同时，政治面貌、籍贯、证件照等字段**原样保留**。

## 任务

### 1. 双向适配层

```
StructuredContent  ←→  JSON Resume v1.0.0
```

- **导出**：结构化内容 → 合法 `resume.json`
- **导入**：`resume.json` → 结构化内容
- **必须无损往返**：导出再导入，内容一致

### 2. 字段映射

| 本项目 | JSON Resume |
|---|---|
| `name` | `basics.name` |
| `job_title` | `basics.label` |
| `email` | `basics.email` |
| `phone` | `basics.phone` |
| `location` | `basics.location` |
| `website` | `basics.url` |
| `summary` | `basics.summary` |
| `github` / `linkedin` | `basics.profiles[]`（`network` + `username`） |
| 工作经历 | `work[]` |
| 项目经历 | `projects[]` |
| 教育背景 | `education[]` |
| 技能 | `skills[]` |

### 3. 中文特有字段的处置（关键）

JSON Resume 的 `additionalProperties: true` 允许扩展。建议：

```jsonc
{
  "basics": {
    "name": "张三",
    "label": "前端工程师",
    "x-chinese": {                          // 扩展命名空间
      "politicalStatus": "中共党员",
      "nativePlace": "浙江杭州",
      "ethnicity": "汉族",
      "birthDate": "1998-03",
      "maritalStatus": "未婚"
    }
  },
  "x-custom-fields": [
    { "label": "身高", "value": "175cm" }
  ]
}
```

- ⚠️ **使用 `x-` 前缀**——这是 JSON 生态中表达扩展的通用约定，**不会与将来的标准字段冲突**
- **不要**把中文特有字段塞进语义不符的标准字段（如把"政治面貌"塞进 `basics.summary`）——那会污染数据并让外部主题渲染出莫名其妙的内容

### 4. 与导出 `.md` 的关系

- `.md` 导出（工单 17）产出**带合法 YAML frontmatter** 的文件
- `resume.json` 是**另一条导出路径**
- 两者的**内容必须一致**（同一份结构化内容的不同序列化）
- **展示态（ADR-0004）在两种导出中都省略**（TD-4），并在导出说明中告知

### 5. 外部主题生态（可选，作为激励）

导出合法 `resume.json` 后，用户可以使用 JSON Resume 的 52 套社区主题渲染。**这不只是兼容性，也是"你的数据属于你"的证明。**

## 验收标准

- [ ] 导出为**合法的** JSON Resume v1.0.0
- [ ] 导入 `resume.json` 正确还原
- [ ] **导出 → 导入 无损往返**（有测试）
- [ ] 中文特有字段用 `x-` 命名空间保留
- [ ] **不污染标准字段的语义**
- [ ] 日期格式符合 JSON Resume 规范（`YYYY-MM-DD` 或 `YYYY-MM`）
- [ ] 与 `.md` 导出内容一致
- [ ] 展示态的处置已决定并在说明中告知
- [ ] 有测试覆盖：往返、缺字段、多余字段、中文值

## 备注

- ⚠️ JSON Resume 的 `skills` 结构与本项目的技能列表可能不同（它有 `keywords[]` 层级）——映射时需明确取舍。
- `additionalProperties: true` 是本方案成立的基础，**若该标准将来收紧，需要重新评估**。

## Comments

（待填）
