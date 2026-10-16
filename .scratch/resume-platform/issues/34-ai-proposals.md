# 34 — AI 提案式编辑（diff + 逐条接受）

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：18（结构化内容）、31、32（产生建议）
- **Blocks**：—
- **ADR**：—

## 背景

当前 `AISectionChat.tsx`（约 467 行）的 `onApplyContent` 是**整体替换**——AI 说改成什么，整段就被换掉。

**Reactive Resume v6 的做法不同**：AI 给出**逐条 diff 的提案**，用户**逐条接受或拒绝**。

而本项目**已经有实现这个的基础**：`AIUpload.tsx` 里有 `computeLineDiff`（LCS 行级 diff，约 1,031 行的文件里）。

## 任务

### 1. 提案模型

```
AIProposal {
  id: string
  sectionId: string
  ops: DiffOp[]        // 复用 computeLineDiff 的输出
  reason?: string      // AI 说明为什么这么改
  source: 'chat' | 'analyze' | 'match'
}
```

### 2. UI

- 在编辑区**内联展示**提案（增删行用视觉标记）
- **每条可单独接受/拒绝**
- 支持"全部接受"/"全部拒绝"
- **接受前必须可见完整变更**——不要一次只显示一行
- 视觉必须遵守 `AGENTS.md`：**增删标记不能用冷色**（当前 `ResumeSourceView` 用了 `text-green-400` 等，属违规，见工单 08）→ 用 `text-success` / `text-danger` token

### 3. 与现有代码的关系

- **`computeLineDiff` 从 `AIUpload.tsx` 抽出**为共享工具（该文件已 1,031 行，是重构对象）
- `AISectionChat` 的 `onApplyContent` **从整体替换改为提案**——这是行为变更，需要 UI 上明确区分"应用提案"与"直接替换"

### 4. 溯源

来自 `analyze`（工单 31）与 `match`（工单 32）的建议**也走同一套提案机制**——一处实现，三处复用。

### 5. 安全

- 提案应用后**必须记入内容版本历史**（工单 16）——AI 的修改也要可回滚
- **拒绝的提案不应被再次提出**（至少在本次会话内）

## 验收标准

- [ ] AI 建议以逐条 diff 呈现，可单独接受/拒绝
- [ ] `computeLineDiff` 抽出为共享工具，**只有一处实现**
- [ ] `analyze` / `match` / `chat` 三个来源共用同一提案 UI
- [ ] 提案应用后产生内容版本历史记录，可回滚
- [ ] 增删标记使用设计 token，无冷色
- [ ] 接受前可见完整变更
- [ ] 拒绝的提案在本次会话内不再出现
- [ ] 游客账户不可应用提案
- [ ] 有测试覆盖 diff 计算与应用逻辑

## 备注

- ⚠️ **这是本计划中体验改进最明显的一项**——从"AI 改了整段，我不知道改了什么"变成"我能看见并逐条决定"。
- `AIUpload.tsx`（1,031 行）与 `ResumeEditor.tsx`（791 行）都是超大文件。**本工单是拆分它们的自然时机**。
- 顺带记录：`readSSEStream` 有**三处重复**（`ResumeBuilderPage` / `AIUpload` / `AISectionChat`），应收敛为一处。

## Comments

（待填）
