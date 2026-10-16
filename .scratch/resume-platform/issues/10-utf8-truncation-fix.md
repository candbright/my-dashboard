# 10 — 后端 UTF-8 截断修复（正在损坏中文简历）

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：无
- **Blocks**：—
- **ADR**：—

## 背景

**这是一个正在静默损坏中文简历的活跃 Bug。**

`kratos-server/internal/service/resumevault/ai.go` 约 444–447 行：

```go
const maxChars = 20000
if len(rawContent) > maxChars {
    rawContent = rawContent[:maxChars]   // ← 字节切片，不是字符
}
```

两个后果：

1. **中文简历在约 6,600 字处被静默截断**（UTF-8 一个汉字占 3 字节，20,000 ÷ 3 ≈ 6,666）。用户看到 AI 解析结果缺了一半内容，**没有任何错误提示**。
2. **可能切在一个汉字的中间**，产生非法 UTF-8 序列 → 下游出现 `�` 乱码。

同一个文件里还有两处相关的硬上限值得一并审视：

- 对话消息：≤ 50 条，**≤ 8,000 字节/条**（中文约 2,600 字）
- 回复：`max_tokens: 4096`（`ai_wire.go`）

而 chat 的 system prompt 要求**每轮重发整份 Markdown 文档**——长简历会同时撞上"单条消息 8,000 字节"与"回复 4,096 tokens"两个上限。

## 任务

### 必须（本工单核心，估 2 行）

1. 改为**按 rune 截断**：
   ```go
   runes := []rune(rawContent)
   if len(runes) > maxChars {
       rawContent = string(runes[:maxChars])
   }
   ```
2. **截断时必须让用户知情**——返回一个明确标记（或错误），不要静默
3. 测试：中文输入 > 20,000 字节 → 输出字符数等于输入的字符数（而非 6,666）

### 建议（可拆为独立工单）

4. 审视 `maxChars` 的**语义**：20,000 应指**字符数还是字节数**？对中文用户，按字符计更符合直觉
5. 记录 chat 的两个上限（8,000 字节/条、4,096 tokens）为已知限制，见 `spec.md` TD-6

## 验收标准

- [ ] 输入 30,000 字节的中文文本 → 不再产生非法 UTF-8
- [ ] 截断时用户收到可见提示
- [ ] 有 Go 测试覆盖：中文、中英混排、边界值（恰好 20,000 字节、恰好切在多字节字符中间）
- [ ] `go test ./internal/...` 通过

## 备注

- 后端已有 **63 个 stdlib 测试**，`ai_test.go` 覆盖 SSRF、stream 解析、各协议请求体——**沿用同样的表驱动风格**加测试。
- 这条属于"流血中"级别，**不应排队**。改动量极小，风险极低。

## Comments

### 实施结果（已完成）

**后端** `kratos-server`：

| 改动 | 位置 |
|---|---|
| 新增 `maxContentChars = 20000`（**按字符**）与 `maxMessageBytes = 8000`（按字节，附理由） | `ai.go` 常量区 |
| `truncateRunes(s, max) (string, string)` —— 按 rune 截断并返回中文提示 | `ai.go` 末尾（新增） |
| `handleParseResume` 改用 `truncateRunes`，删掉 `rawContent[:maxChars]` | `ai.go` `handleParseResume` |
| `handleChat` 单条消息上限改用命名常量，并**新增 `utf8.ValidString` 校验** | `ai.go` `handleChat` |
| `streamAIRequest` 新增 `notice` 参数，并在任何 delta **之前**以独立键发出 `{"notice":…}` | `ai.go` `streamAIRequest` |

**为什么选"通知"而不是"报错"**：`handleParseResume` 的截断发生在流式响应**开始之前**，本可以返回 400。但用户提交一份长简历时，拒绝服务比截断后如实告知更糟。因此改为发一个 **`notice` 帧**——它描述的是"我们发出去了什么"，不是模型输出。

**契约设计要点**：`notice` 用独立键。旧客户端只消费 `parsed.content`，遇到 `notice` 帧会拼接空字符串而**不丢任何数据**。这个前向兼容性是刻意设计的。

**前端** `my-dashboard`：

| 改动 | 位置 |
|---|---|
| 新增共享 SSE 读取器（`SSEHandlers` / `SSEResult` / `readSSEStream` / `readSSEText`） | `src/lib/sse.ts`（新增） |
| **收敛三处逐字节重复的读取实现**，并**修复 `parsed.error` 被静默丢弃**的既有缺陷 | `AISectionChat` / `AIUpload` / `ResumeBuilderPage` |
| `notice` 在聊天消息内显示（不占用新的 UI 区域） | `AISectionChat`、`AIUpload` 的 `AssistantMessage` |
| `notice` 以警示条显示在编辑器上方 | `ResumeBuilderPage` |

**顺带修复的缺陷**：三处读取器都只处理 `parsed.content`，`parsed.error` 被静默丢弃——后端中途失败时前端会把它当成"一段较短的正常回答"。共享实现修正了这一点，并加了 `onError` 回调。

**类型安全加固**：旧调用形态 `readSSEStream(res, callback)` 在结构上兼容对象参数，会**静默无效**。已在 `sse.ts` 加 `never` 重载，使该误用变成编译错误（已验证报 `TS2559`）。

### 验收

| 项 | 结果 |
|---|---|
| 输入 30,000 字节中文 → 不产生非法 UTF-8 | ✅ 测试覆盖 |
| 截断时用户收到可见提示 | ✅ 后端 `notice` 帧 + 前端三处显示 |
| Go 测试覆盖中文/中英混排/边界值 | ✅ `ai_truncate_test.go`，11 个用例（含"恰好 20,000 字不截断"与"切点落在多字节字符上") |
| `go test ./internal/...` 通过 | ✅ |
| `npm run build` + `tsc --noEmit` 通过 | ✅ |

**数值对账**：修复前 20,000 **字节** ⇒ 中文约 **6,666 字**；修复后 20,000 **字**。

### 遗留（不属本工单）

- `kratos-server` 有 **28 个文件不符合 `gofmt`**（含大量 `struct` 字段对齐），系既有状态。本次仅使 `ai.go` 合规，其余未动，以免产生与本次改动无关的巨型 diff。建议另开一个"仓库格式化"工单。
- 仓库无 `.gitattributes`，而 `core.autocrlf=true`；`gofmt -w` 输出 LF，git 下次触碰时转回 CRLF。建议加 `.gitattributes` 固定换行策略（同上，另开工单）。
- 对话的两个上限（单条 8,000 字节、回复 4,096 tokens）已按工单建议**记为已知限制**，见 `spec.md` TD-6。

