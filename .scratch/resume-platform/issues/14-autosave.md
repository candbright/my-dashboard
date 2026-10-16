# 14 — 自动保存

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：12（乐观锁）
- **Blocks**：16（版本历史）
- **ADR**：[ADR-0010](../../../docs/adr/0010-content-versioning-and-optimistic-locking.md)

## 背景

`ResumeEditor.tsx`（约 791 行）**只能手动保存**。

自动保存是**行业门槛功能**——所有商业产品都有；缺了就是"这产品不能用"级别。市场调研将其列为 Table Stakes 的 P0。

⚠️ **本工单硬依赖工单 12**（`version` 乐观锁）。在没有并发控制的表上开启自动保存会主动制造数据丢失。

## 任务

1. **触发策略**（建议）：
   - 编辑停止后 debounce（约 1.5–2 秒）
   - 切换章节或失焦时立即保存
   - 页面 `beforeunload` 时若有未保存改动则警告
2. **保存状态可见**：`未保存` / `保存中` / `已保存于 HH:mm` / `保存失败，重试中`
3. **携带 `version`**（工单 12）；收到 **409** → 停止自动保存，**明确提示用户**并让其选择（不做自动合并）
4. **失败重试**：网络失败时退避重试，**不能静默丢弃改动**
5. **不打断输入**：保存过程中不影响光标位置与输入（当前 `ResumeEditor` 的 `useState(initFm)` / `useState(initSections)` 只捕获首次渲染的值，`props` 更新不会刷新——**这个既有缺陷必须先修**，否则自动保存后回传的数据不会反映到 UI）
6. **游客账户**：只读，不触发保存

## 验收标准

- [ ] 编辑后约 2 秒自动保存，状态指示器正确反映
- [ ] 两标签页并发编辑 → 409 提示，**用户输入不丢失**
- [ ] 断网 → 显示"保存失败"，恢复后自动重试成功
- [ ] 保存不重置光标位置、不重排列表
- [ ] 关闭页面前有未保存改动会被警告
- [ ] `ResumeEditor` 的 props 不同步缺陷已修复
- [ ] 游客账户不触发保存请求

## 备注

- ⚠️ `ResumeEditor.tsx` 已 **791 行**，本工单会继续增长它。**建议在实现自动保存前先抽出保存逻辑为独立 hook**（如 `useResumeAutosave`），否则这个文件会失控。
- 顺带记录：`ResumeBuilderPage.tsx`、`AIUpload.tsx`、`AISectionChat.tsx` **各自抄了一份 `readSSEStream`**——三份重复，属技术债，可在相关工单中收敛（不阻塞本工单）。

## Comments

### 实施结果

已实现。保存策略被抽成 **纯 reducer**（`autosave-machine.ts`），hook 只是定时器与 `beforeunload` 的外壳——因为"用户的改动还在不在"这条规则不能只在浏览器里被发现。

**先抽出 hook 再动手**（备注里的建议）：`ResumeEditor.tsx` 本工单只从 882 行增到 939 行，且新增部分全部是 `onFlush` 的透传与注释，自动保存逻辑一行都没进去。

### 验收标准

| 标准 | 结果 | 证据 |
|---|---|---|
| 编辑后约 2 秒自动保存，状态指示器正确反映 | ✅ | debounce 默认 1500ms；`autosave-sim` 实测首次保存在编辑后 **1600ms**；7 种标签互不相同（`autosave-indicator.test.ts`） |
| 两标签页并发编辑 → 409 提示，**用户输入不丢失** | ✅ | 409 → `classifyFailure` 返回 `conflict` → 状态 `conflict` 且 `stopped: true`；`savedText` 保持为服务端旧值，编辑缓冲从未被改写。已有 `ConflictNotice` 负责让用户选择 |
| 断网 → 显示"保存失败"，恢复后自动重试成功 | ✅ | `autosave-sim` 场景 1：3 次断网 + 第 4 次成功，退避间隔 **1835 → 3448 → 7794ms**，全程只发**原始文本**，重试无需用户操作 |
| 保存不重置光标位置、不重排列表 | ✅ | hook 只读 `markdown`，从不写回；返回的 `savedText` 只进 reducer。`ResumePageClient` 的 `setParsed`/`setMarkdown` 作用于**只读视图**的状态，编辑缓冲 `editMarkdown` 不受影响 |
| 关闭页面前有未保存改动会被警告 | ✅ | `beforeunload` 监听器**仅在 `dirty` 时注册**，干净时移除；`dirty` 由 `isDirty()` 派生 |
| `ResumeEditor` 的 props 不同步缺陷已修复 | ✅ | 新增显式 `resetToken` prop（见下） |
| 游客账户不触发保存请求 | ✅ | `enabled: mode === 'edit' && permissions.can_edit && !isGuest`；`enabled: false` 时 debounce effect **直接 return，不调度任何定时器** |

### 关键决策

1. **`retrying` 不是独立状态。** 初版把它做成 `AutosaveStatus` 的一员，结果 reducer 里 `shouldSave` 在 `retrying` 时返回 `false`——**它拒绝了自己存在的意义（重试）**。改为：可重试失败后状态保持 `pending`（文本确实仍未保存、也确实欠一次重试），"正在重试"由 `retries > 0` 表达。指示器的文案因此多一个 `retrying` 参数，而不是多一个状态。
2. **`onFlush` 传"请求保存"而不是"保存"。** 编辑器在章节切换、增删章节、字段失焦时调用它；真正是否发请求由 `attempt` 内部的 `shouldSave` 决定。这样"每次失焦都发一个请求"不会发生，而编辑器也不需要知道保存策略。
3. **`saveNow` / `retry` 只 bump 计数器。** `attempt` 是 `useEffectEvent`，按 React 规则**只能从 effect 调用**，而这两个是事件处理器。硬压规则会掩盖它保护的东西（事件处理器在提交周期之外运行，读到的可能是即将被替换的 state），所以处理器改为请求保存（`flushTick` / `retryTick`），由 effect 在**已提交的 state** 上发起。全文件只有一个地方碰网络。
4. **`resetToken` 而不是监听 `parsed`。** `parsed` 由父组件从 `onContentChange` 派生，监听它会让每次击键都重置表单。显式令牌把"重置"变成意图而非副作用。当前 `parsed` 在编辑期间不变（缺陷是**潜伏**的），令牌为将来铺路且不留反馈回路。
5. **`useEffectEvent` 而不是"渲染期写 ref"。** 仓库 lint 基线把 `ref.current = x` 列为 error，理由成立（并发不安全）。本工单的新代码**一处都没有**；基线 14 errors / 16 warnings 未增长（新文件 0 error 0 warning）。`ResumeEditor.tsx` 那 1 个 error 是工单 08 的既存 `onContentChangeRef`，本工单未碰。
6. **`enabled: false` 是硬开关**，不是节流：不发任何请求。
7. **失败永不丢弃草稿**：`savedText` 只记录服务端已知的内容，reducer 从不写编辑器文本。

### 顺带发现并修复的真实缺陷

- **`ResumeEditor` 的 props 不同步**（工单点名要求先修）：`useState(parsedToEditable(parsed))` 只捕获首次渲染的值。已按决策 4 修。
- **我的初版 reducer 在冲突后一次击键就丢掉了冲突**：`edit` 分支把 `stopped` 重置为 `false`、状态改成 `pending`，下一次 debounce 就会覆盖锁刚刚拒绝覆盖的版本。**被我自己的测试抓到**（`keeps a conflict sticky while the user keeps typing`），已改为冲突分支直接返回、只递增 `seq`。
- **`saveNow` 一度没有 `shouldSave` 守卫**：因为 `attempt` 是 effect event、不能从处理器读 state，我在改写时把守卫丢了，那会让每次失焦都发一个请求。已把守卫统一放进 `attempt`——所有路径（debounce / flush / retry）共用同一条规则，且新增调用方无法忘记检查。

### 关于"浏览器端验证"——本次未做，原因如下

**没有在真实浏览器里驱动自动保存，是刻意的。** 现场状况：

- 后端 PID 26524 运行的是**工单 12 之前的旧二进制**：`GET /api/resumes/{id}` 的返回里**没有 `version` 字段**（已实测：`keys: approval_status, created_at, ... visibility`，无 `version`）。
- `resumeVersion()` 对缺失的 version 返回 `0`，而旧二进制的 proto 不认识该字段，会**忽略它并无条件写入**。

也就是说，此时浏览器里能看到"已保存于 HH:mm"，但那是**无锁写入**的结果——一个会掩盖工单 12/14 前提的假阳性。制造这种证据比没有证据更糟，故不做。同理，`resume_vault` 库仍未迁移（0 张 `schema_migrations`）。

**已完成的替代验证**（均为真实模块、非重新实现）：

1. `npm run build` → ✓ Compiled successfully，14 条路由。
2. `npx tsc --noEmit` → 0。
3. `npm run test` → **384 passed | 9 expected fail（393）**，14 个文件。
4. `autosave-sim`（临时脚本，已删除）：把**真实** reducer + 分类器 + 退避串成浏览器控制流，5 组断言全过——断网重试收敛、退避递增且在 `[1s, 2s]` 起跳、重试只发**原始文本**、冲突后打字不解锁、重试预算有界（6 次后停止）、13 个 HTTP 状态分类全对。
5. 路由 `/resume/[slug]` 经 dev server（PID 20648）编译渲染正常——首次 404 已查明是**私密简历无 cookie 得 403**，不是编译失败（带 admin token 请求 `by-slug` 返回 200）。

**留给部署窗口的验证**：迁移后端库、部署含工单 12 的二进制后，在浏览器里走一遍真实的双标签页 409 与断网重试。

### 改动文件

新增：

- `src/lib/autosave-machine.ts` — 纯状态机（`AutosaveStatus`、`AutosaveState`、`applyAutosaveEvent`、`isDirty`、`shouldSave`）
- `src/lib/autosave-machine.test.ts` — 22 例
- `src/lib/autosave-failure.ts` / `.test.ts` — 失败分类与退避，15 例
- `src/lib/autosave-indicator.ts` / `.test.ts` — 文案与色调，14 例
- `src/hooks/useResumeAutosave.ts` — 定时器外壳
- `src/components/AutosaveIndicator.tsx` — 指示器 UI（`role="status"` + `aria-live="polite"`）

修改：

- `src/components/ResumeEditor.tsx` — `resetToken`、`onFlush` 及其透传；章节切换/增删/失焦触发
- `src/components/ResumePageClient.tsx` — 接线：`autosavePersist`（**不复用 `handleSave`**，后者以 `setMode('view')` 结尾，会让自动保存每 2 秒把用户踢出编辑器）、`autosaveEnabled`、指示器渲染

### 验证命令

```
npx tsc --noEmit
npm run build
npm run test
npx eslint src/hooks/useResumeAutosave.ts src/lib/autosave-*.ts src/components/AutosaveIndicator.tsx
```

### 未做 / 依赖后续

- 三处重复的 `readSSEStream`（`ResumeBuilderPage.tsx`、`AIUpload.tsx`、`AISectionChat.tsx`）未收敛——备注已声明不阻塞本工单。
- 版本历史（工单 16）将复用本工单的 `version` 语义。
- 退避上限 30s、预算 5 次为常量（`MAX_AUTOSAVE_RETRIES`），未做配置化。
