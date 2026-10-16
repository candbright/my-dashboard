# 39 — DOCX 导出

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：23（渲染服务）
- **Blocks**：—
- **ADR**：[ADR-0007](../../../docs/adr/0007-render-service-boundary.md)

## 背景

国内 HR 普遍要求 **Word 格式**（可编辑、可批注、公司模板统一）。

当前只支持（且是坏的）PDF。

调研中的产品对比：Reactive Resume 支持 DOCX 导出；国内产品普遍支持 Word。

## 任务

### 1. 实现路径选择（本工单需要决策并记录）

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. `docx` npm 库**（服务端生成 OOXML） | 精确控制、无外部依赖、纯 Node | 需要手写排版映射 |
| **B. HTML → DOCX 转换器** | 可复用模板 HTML | 转换质量不稳定，中文排版风险高 |
| **C. LibreOffice headless 转 PDF→DOCX** | 复用现有渲染 | 又一个重容器，且 PDF→DOCX 质量差 |

**建议 A**——DOCX 是结构化格式，而你的内容**已经是结构化的**（工单 18）。直接映射比"渲染再逆向"正确得多。

### 2. 与渲染服务的关系

⚠️ DOCX **不是 PDF**，渲染服务的 `RenderResume → 文件字节` 契约需要泛化：

- 要么扩展为 `RenderResume(content, presentation, format)`
- 要么平行实现 `RenderDocx`

**本工单需要明确选择**，并保持 ADR-0007 的"引擎可替换"原则。

### 3. 中文字体

DOCX 只**声明**字体名，实际字体由打开者的机器提供。因此：
- 声明 `Noto Serif SC` 或通用的中文字体名
- **必须同时声明 fallback**（如 `宋体`），否则在无该字体的机器上回退到默认字体
- ⚠️ 与 PDF 不同，**DOCX 不做字体嵌入**——这意味着**排版在不同机器上会不同**，需在 UI 上说明

### 4. 排版映射

- 章节标题 → Word `Heading` 样式（**便于 HR 编辑与导航**）
- 条目 → 普通段落 + 列表
- **使用真实 Word 列表**（不是手动 `-` 字符）
- 页边距、字号等从展示态映射

### 5. `assertPdfText` 的等价物

⚠️ **PDF 的文字层断言不适用于 DOCX**。DOCX 需要自己的验证：
- 解压 `.docx`，检查 `word/document.xml` 中的文本内容
- 断言中文存在且未被转义

## 验收标准

- [ ] 导出 `.docx` 可被 Word / WPS / LibreOffice 打开
- [ ] 中文正确显示，无乱码
- [ ] 章节标题使用 Word 的 Heading 样式
- [ ] 列表使用真实 Word 列表
- [ ] 字体声明含 fallback
- [ ] UI 上说明"DOCX 排版会随打开者机器上的字体变化"
- [ ] 有 DOCX 文本层验证（解压检查 XML 内容）
- [ ] 游客账户的导出行为符合既有规则

## 备注

- ⚠️ **DOCX 的排版不可控**是这个格式的本质（无字体嵌入）。**不要承诺"和 PDF 一模一样"**——那是不可能的。
- 若目标用户主要是国内求职者，**DOCX 的实际使用频率可能高于 PDF**（HR 要求 Word 版）。

## Comments

（待填）
