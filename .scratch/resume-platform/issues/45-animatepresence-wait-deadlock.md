# 45 — `AnimatePresence mode="wait"` 的切换死锁

- **Type**：task
- **Status**：needs-triage
- **Blocked by**：—
- **Blocks**：—
- **ADR**：—

## 背景

`mode="wait"` 的语义是：**旧视图离场动画结束后，才挂载新视图**。这反过来意味着，如果驱动切换的那个 state 在离场窗口（本仓统一 `duration-500`）之内又变回去，那么离场永远等不到"新视图"，**新视图就永远不会挂载**。

失败的样子不是报错，而是**卡住**：界面停在旧视图上，没有任何提示，也没有出口。这与工单 44 记录的那一类缺陷同源——「界面把一个『坏了』渲染成了『没事』」，只是这次连"空状态"都没有，是纯粹的静止。

## 已发生的一处（已修复）

**创建简历 → 上传文件 → AI 解析**（`src/components/ResumeStartScreen.tsx`）。AI 解析的进度视图原本放在这组视图的 `AnimatePresence mode="wait"` 里：

1. 点「AI 智能解析」→ `parsing = true`，进度视图开始入场；
2. 解析**在毫秒级失败**（AI 来源未配置是最常见的情况，`/api/ai/parse` 直接返回错误）；
3. 失败把 `parsing` 变回 `false` —— 此时进度视图的**入场动画还没走完**；
4. 反向切换的离场永远不结束，输入区再也不挂载。

用户看到的是一屏冻结的「AI 正在解析…」：错误横幅（在 `AnimatePresence` 之外）确实出现了，但**输入框和「AI 智能解析」按钮都没有了**，无法重试、无法改文本，只能刷新页面。这比修复前"什么都不显示"更难摆脱。

### 复现证据

`src/components/ResumeBuilderPage.test.tsx` 的「shows the server's own reason when the parse fails」驱动真实请求路径，断言失败后输入区必须回来。把 `mode="wait"` 加回那组视图后，该用例**失败**：

```
AssertionError: no button labelled AI 智能解析: expected undefined to be defined
```

去掉后通过。**注意**：组件级用例（`ResumeStartScreen.test.tsx` 的「gives the inputs back when a parse ends…」，两个 state 翻转之间不等待）在**两种实现下都通过**，因此这个死锁**无法只靠 props 判定**——必须在真实请求路径上验证。这一点值得记住，否则会误以为已有覆盖。

### 采用的修法

那三个视图**不再包** `AnimatePresence`，改为直接条件切换（各自仍保留入场淡入）。这样切换是同步的，不存在等待，也就无法死锁；等待本身由进度视图承担，而不是由转场承担。

## 其余站点（未修，潜在）

> **2026-10-15 重扫**（工单 48 改动之后）：下表按当前代码逐处重新核对。与初次记录相比，`AIUpload.tsx`、`FileUpload.tsx`（2 处）、`UploadPageClient.tsx` 已随工单 48 删除，`ResumeStartScreen.tsx` 的行号变了；**确认死锁的那一处（AI 解析进度视图）已经不在任何 `mode="wait"` 里**。

全仓另有 **5 处** `mode="wait"`：

| 位置 | 切换的 state | 现状 |
|---|---|---|
| `ResumeStartScreen.tsx:271` | `expanded`（卡片 ↔ 面板） | 潜在：卡片与「返回」之间快速点击。**解析进度视图不在这组里**（本工单已修），因此没有「网络失败驱动的自动回切」这条路径 |
| `app/my/page.tsx:196` | 列表视图 | 潜在 |
| `app/login/page.tsx:151` | 登录方式 | 潜在 |
| `DashboardClient.tsx:136` | 视图 | 潜在 |
| `ResumePageClient.tsx:753` | 视图 | 潜在 |


它们都**不是**已确认的线上缺陷：与上面那处不同，这些切换由**用户操作**驱动，两次操作间隔通常远大于 500ms，需要的是一次 500ms 内的双击。真正危险的是**由网络失败驱动的自动回切**（毫秒级、不可控）——那一类重扫后已经不存在了（创建页那处已修）。

## 任务

1. 逐个站点确认是否存在"自动回切"路径（请求失败、校验失败、abort、初始数据到达等）：有则改为同步切换，或让被等待的离场有超时兜底。
2. 为 `mode="wait"` 的用法补一条约定/说明：**不要在它里面切换一个可能被异步结果立刻翻回去的 state**。
3. 想要保留离场动画时，优先 `mode="popLayout"` 或让新旧视图并存，而不是"等旧的走完"。
