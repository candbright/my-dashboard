# ResumeVault 只读审计报告

- **日期**：2026-10-14
- **范围**：`D:\project-me\my-dashboard`（前端，只读）、`D:\project-me\kratos-server`（后端，只读）
- **约束**：未修改任何文件。所有前端改动建议均以「工单候选」形式给出。
- **重要环境说明**：审计期间**有另一个写入者在并发修改本仓库**（`src/components/ui/Animations.a11y.test.tsx` 在 11:20:12 → 11:21:20 之间从 6019 字节增长到 6957 字节，且其 `it.fails` 用例由失败转为通过）。本报告中所有断言均标注了观测时刻的状态。**凡涉及 a11y 测试文件的结论，请在动手前重新确认。**

---

## 审计方法（可复现）

| 手段 | 用途 |
|---|---|
| 读 `.next/dev/logs/next-development.log`（2242 行，含 1495 条浏览器消息） | 无限渲染循环的**运行时证据**，不做猜测 |
| `npx vitest run` | 测试基线（两次运行：11:15:37 与 11:21:41） |
| `npx eslint src` | 静态缺陷清单（14 error / 10 warning） |
| `Select-String` 全仓正则扫描 | 可访问性属性覆盖、空 catch、storage/console 用法 |
| 逐个读文件 | 每一条结论的落点 |
| 读 `node_modules` 依赖体积 | 包重（**解压体积**，非产物体积，见 §2.5 的说明） |

**未做**：`npm run build`。理由：PID 34628 的 dev server 正在运行，`next build` 会覆写 `.next/`（dev cache、`build-manifest.json`、静态 chunk），可能破坏该 dev server 会话，而**修复它是本次审计的输入之一**。因此**任何精确到 KB 的产物体积数字本报告一律标为 unverified**。

---

## 1. 高优先级缺陷

按 (严重度 × 可能性) / 工作量排序。

### H1 — 无限渲染循环：`useResumeAutosave` 在 `enabled: false` 时每次渲染都 dispatch

- **落点**：
  - `src/hooks/useResumeAutosave.ts:242-267`（effect），错误行 **:245**
  - `src/lib/autosave-machine.ts:203-204`（reducer 分支）
- **触发条件**：`enabled === false`。即 `/resume/<slug>` 上 `mode !== 'edit' || !permissions.can_edit || isGuest`（`src/components/ResumePageClient.tsx:427`）。**公开访客一进页面就满足**（`mode` 初值 `'view'`，:202）。

**机制（已逐行确认）**：

```ts
// useResumeAutosave.ts:242-267
useEffect(() => {
    if (!enabled) {
      clearTimer();
      dispatch({ type: 'disabled' });   // :245
      return;
    }
    ...
}, [state, markdown, enabled, suspended, debounceMs, clearTimer]);  // :267 ← state 在依赖里
```

```ts
// autosave-machine.ts:203-204
case 'disabled':
  return { ...state, status: 'idle', stopped: true, error: null };  // 每次都是新对象
```

1. `enabled === false` → 同步 `dispatch({type:'disabled'})`
2. reducer 返回**新对象**（即使字段值完全不变）→ `state` 引用变化
3. `state` 是 effect 依赖（:267）→ effect 重跑 → 回到第 1 步
4. React 的嵌套更新守卫在约 50 次后抛 `Maximum update depth exceeded`，丢弃这批更新并重新渲染 → 循环重新开始

**讽刺之处**：同一个文件 `:233-234` 的注释明确写着「`state` 是故意不放进依赖的：它会作为这里 dispatch 的结果而改变，放进依赖会**循环 dispatch**」——紧邻的那个 effect（:235-237）遵守了这条规则，这个 effect（:242-267）没有。`state` 必须留在依赖里（它驱动 `shouldSave`），所以正确的修法是让 reducer 在状态已等价时**返回原引用**（或把 `disabled` 分支改成只 dispatch 一次）。

**验证方法与证据**：

- **运行时**（非推断）：`.next/dev/logs/next-development.log`
  - 2242 行中 **1492 行**是 `Maximum update depth exceeded`（占 66%）
  - 日志中**唯一**出现的业务栈帧是 `at useResumeAutosave.useEffect (src/hooks/useResumeAutosave.ts:245:7)`，出现 **746 次**
  - 频率：按秒分组，`00:01:50`–`00:02:01` 共 50.5 秒内 1492 条；峰值 42 条/秒（`00:01:58`），6 秒窗口约 6–42 条——**与题面给的「约 24 条 / 6 秒」吻合**
  - 除该错误外，浏览器消息中**没有其他**错误类型（`non-loop browser messages: 0`，仅剩 3 条 React DevTools 提示）
- **源码**：上引两处代码逐行读过。

**是否唯一**：**是**。依据是日志里 1492 条错误中只出现这一个业务栈帧，且没有第二类浏览器错误。**限制**：只覆盖了曾在该 dev server 上被访问过的页面。`ResumeEditor` 曾在 `00a8e88`（"fix infinite render loop"）修过一次同类问题（`onContentChange` via ref），现在是 **`ResumeEditor.tsx:213-214`** 的 `onContentChangeRef.current = onContentChange` 渲染期写 ref——ESLint 报 error（`react-hooks/refs`），但**不**造成循环（:216-225 的 effect 依赖是 `[frontmatter, sections]`）。

- **严重度**：高（生产环境表现为每个公开简历页持续崩溃式重渲染；CPU 与电量；React 的更新丢弃会让状态更新看起来"莫名丢掉"）
- **工作量**：小（1 行 reducer 改动 + 1 条回归用例；见 §6-T1）

---

### H2 — 无 JS 时公开简历页**内容全部不可见**

- **落点**：`src/components/ui/Animations.tsx:109-118`（`ScrollReveal`）、`:110` `initial={{ opacity: 0, y: 30 }}`；使用处 `src/components/ResumeDisplay.tsx:213`
- **什么坏了**：`ScrollReveal` 服务端渲染出 `style="opacity:0;transform:translateY(30px)"`，只有 framer-motion 的客户端 effect 会把它改成 `opacity:1`。`ResumeDisplay.tsx:212-216` 用 `ScrollReveal` **包住了每一个章节**，所以没有 JavaScript 时，公开简历页只剩页头/页脚和**一片空白**。
- **验证**：`src/components/ui/Animations.a11y.test.tsx:117-131` 已用 `renderToStaticMarkup` 断言这件事**当前成立**（该用例是 `it`，已通过）。我另外读了 `ResumeDisplay.tsx:212-216` 确认包裹范围是全部 section。仓库内**没有 `noscript` 兜底**（grep `noscript|no-js` 无结果）。
- **为什么算高优先级**：公开简历是唯一的对外产物（`CONTEXT.md` §1 在线简历），而它的正文在无 JS 环境下为零。这不只是"没动画"。
- **严重度**：中高（依赖 JS 的场景：爬虫/预渲染抓取、JS 加载失败、强 CSP 环境、老旧设备）；**同时也是 SEO 风险**——本仓库尚无 `sitemap`/JSON-LD（工单 37 未做）
- **工作量**：小（`ScrollReveal` 改为不设初始 `opacity:0`，或用 `@media (scripting: none)`+CSS；注意 `MotionConfig`/`useReducedMotion` 是另一个问题，见 §3.4）

---

### H3 — 审批队列与 AI 全局配置各自对每行发一条 SQL（N+1）

- **落点**：
  - 循环：`internal/service/resumevault/approval.go:75-78`（`handleListApprovals`）
  - 循环：`internal/service/resumevault/ai.go:923-926`（`handleGetGlobalAI`）
  - 每次迭代的查询：`internal/service/resumevault/approval.go:46` → `internal/biz/approval/approval.go:659` → `internal/service/resumevault/approval.go:411` `resumeUC.GetResume(...)` → `internal/data/resumevault/resume.go`（`GetByID`）
- **代价**：`DefaultListLimit = 200`（`internal/biz/resumevault/resume.go:188`），一个**满页**的审批队列 = `1 (列表) + 1 (Count) + 3 (各类型 Count) + N (每条简历申请一次 GetResume)`。N 最大 200 → **单次 `GET /api/admin/approvals` 最多 205 条 SQL**。`GET /api/admin/ai` 同理。
- **验证**：我读完了从 handler 到 `GetByID` 的整条调用链；`approvalRequestPayload`（`approval.go:27`）在 `:46` 无条件调用 `uc.Resolve`，而 `uc.Resolve` 在 `:659` 调用注册的 handler；简历 handler 在 `:411` 发查询。AI 类型的 handler（`:446-448`）返回空 map，所以只有简历申请产生额外查询——**即成本随队列中简历申请的数量线性增长**。
- **严重度**：中高（管理员页面，队列越长越慢；200 条 × 每条一次 round-trip 在本地是几十毫秒，跨网段就是秒级）
- **工作量**：中（需要一个批量解析入口：`ResolveMany(ctx, reqs)` 或一次 `WHERE id = ANY($1)`）

---

### H4 — `resumes` 表缺 `(visibility, approval_status)` 索引，公开列表是顺序扫描

- **落点**：模型无该索引 `internal/data/resumevault/model.go:26-27`（`Visibility` / `ApprovalStatus` 均无 `index` 标签）；查询见 `internal/data/resumevault/resume.go:460-471`（`ListPublicApproved`）与 `:497-503`（`ListPending`）；计数见 `:516-523`
- **什么坏了**：`GET /api/resumes`（公开列表）走 `WHERE visibility='public' AND approval_status='approved' ORDER BY created_at DESC LIMIT 201`，无可用索引 → 全表扫描 + 排序。工单 09 新增的 `CountPublicApproved` 让这个扫描从**每请求一次**变成**每请求两次**（列表一次 + 计数一次）。
- **验证**：`internal/data/migrate/migrate.go:6-7` 的注释**自己**把 `resumes(visibility, approval_status)` 列为「AutoMigrate 无法表达的索引」的例子；但 `internal/data/data.go` 的迁移清单只有 Version 1–4（`:149,166,176,191`），**没有任何一条创建该索引**。`migrate_postgres_test.go:255-263` 用的是临时表 `migration_probe_indexed`，是探针不是真实索引。
- **严重度**：中（当前数据量小，影响可忽略；但工单 09 的备注已把"索引收益变高"记录在案，且这是**已经识别却未落地**的项）
- **工作量**：小（一条 `CREATE INDEX CONCURRENTLY` 迁移，`migrate` 包已支持 `NoTransaction`）

---

### H5 — `AIUpload` 用 `useState` 的初始化函数发请求：双发 + 永挂加载态

- **落点**：`src/components/AIUpload.tsx:136-141`

```tsx
// Check AI config status
useState(() => {                                   // :136 ← useState，不是 useEffect
    apiFetch('/api/ai/config')
      .then((res) => res.json())
      .then((data) => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));
});
```

三个独立后果：

1. **不返回值**，所以这个 `useState` 的 state 永远是 `undefined`，而结果被推进了另一个 state（`:83` 的 `setAiConfigured`）——初始化函数被当成 effect 用。
2. **每次挂载发两次请求**：React StrictMode（Next 16 dev 默认开启）会双调用初始化函数。
3. **可能永久卡在加载态**：若响应体没有 `configured` 字段，`setAiConfigured(undefined)`；`undefined !== false` 且 `undefined !== null`，于是 `:457` 的"未配置"分支和 `:482` 的加载分支**都不匹配**——实际上它会落到正常 UI。但如果该组件因任何原因重挂载（父级 key 变化）而请求变慢，`:482` 的 `Spinner` 会一直转，因为**没有超时也没有重试路径**。

- **验证**：逐行读了 `:136-141`、`:83`、`:457-488`。`aiConfigured` 全仓只有 3 处引用（`:83` 定义、`:457`、`:482`）。
- **严重度**：中（多一个无谓请求 + 一个无出路的加载态）
- **工作量**：小（改成 `useEffect`，并给 `data.configured === true` 的显式判定）

---

### H6 — 权限二次拉取失败被静默吞掉，且真值会被假值覆盖

- **落点**：`src/components/ResumePageClient.tsx:237-249`，吞掉错误的是 **:248** `.catch(() => {})`

```tsx
if (serverPermissions && (serverPermissions.can_edit || serverPermissions.can_change_visibility)) return;  // :240
apiFetch(`/api/resumes/${initialResume.id}`)
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => { if (data?.permissions) setPermissions(data.permissions); })
  .catch(() => {});   // :248
```

两个问题：

1. **失败无声**：网络错误或 5xx 时**没有任何日志、没有 toast、没有重试**。用户的编辑按钮就是不出现，而界面上没有一句话解释为什么。（对比：本仓库其它地方都有一条中文提示路径。）
2. **假值可覆盖真值**：`:240` 的守卫只保护 `can_edit || can_change_visibility` 为真的情况。`serverPermissions`（来自服务端 cookie 鉴权，可能因为 cookie 未同步而偏保守）若为 `{can_edit:false, can_change_visibility:false, is_owner:true}`，守卫不生效，客户端重新拉取；若这次拉取返回成功但权限同样偏低，`setPermissions` 会用一份**新的、权限更低的**对象覆盖 `serverPermissions`——`is_owner` 等字段随响应体变化。这是 `:206` 的 SSR 首屏权限与客户端权限之间没有合并规则的直接结果。
- **验证**：读了 `:237-249`、`:206`、以及 `defaultPermissions` 的使用点。该 effect 依赖 `[initialResume.id, serverPermissions]`，其中 `serverPermissions` 是服务端传下来的稳定对象引用（`page.tsx:83`），所以它**不**自我循环（`setPermissions` 不改变依赖）。这一点我单独确认过，因为它是本仓库的已知失败模式（见 H1）。
- **严重度**：中（静默的能力降级 + 潜在的所有者权限丢失）
- **工作量**：小（`.catch` 里给一条中文提示；`setPermissions` 改为合并而非替换）

---

### H7 — `list-limit.ts` 手抄后端常量，UI 文案会静默说谎

- **落点**：
  - `src/lib/list-limit.ts:22-26`
    ```ts
    /** Mirrors `rvbiz.DefaultListLimit` in kratos-server. */
    export const RESUME_LIST_DEFAULT_LIMIT = 200;
    /** Mirrors `approvalbiz.DefaultListLimit` in kratos-server. */
    export const APPROVAL_LIST_DEFAULT_LIMIT = 200;
    ```
  - 后端来源：`internal/biz/resumevault/resume.go:188`、`internal/biz/approval/*`
  - 消费点：`src/lib/list-limit.ts:83`（`limit` 回退值）→ `:94` / `:106` 的用户可见中文句子
- **什么坏了**：`buildListLimitNotice`（`:69-85`）在响应缺 `limit` 时用 `defaultLimit` 兜底，而文案里会写出这个数字：`"（单次上限 ${notice.limit} 份）"`。后端把 `DefaultListLimit` 从 200 改成 500 后，**前端会继续告诉用户上限是 200**，且没有任何测试或类型会失败。两个前端常量还分别镜像两个**不同的** Go 常量——它们今天都是 200，这让漂移更不容易被发现。
- **验证**：读了 `list-limit.ts` 全文与两个 Go 常量的定义。`invariants/design-system.test.ts` 只检查颜色/圆角类名，不检查这个。
- **严重度**：中（用户被告知一个错误的容量数字，且这是"内容丢失"叙事的直接表达）
- **工作量**：小（改为从响应读 `limit` 并在缺失时**不写出数字**，或让后端在响应里始终带上 `limit`——工单 09 的实现其实已经回显了 `limit`，所以前端可以只依赖它）

---

### H8 — 验证码以明文写进服务端日志（与部署形态无关，恒定发生）

- **落点**：`internal/biz/user/auth.go:291`

```go
uc.log.Infof("[验证码] %s: %s (类型: %s)", email, code, codeType)
```

- **什么坏了**：`code` 是**可用于登录/绑定邮箱的一次性凭证**，有效期 10 分钟（`:284`）。它被无条件写入日志，而 `isDev` 分支（`:297-299`）就在下一行——说明作者已经在区分开发/生产，但日志这句没有跟着分。任何能读日志的人（运维、日志聚合系统、共享终端）都可以冒充该邮箱完成登录或改绑。
- **验证**：读了 `:275-301`。日志器是 Kratos 标准 logger（`log.NewHelper`，`internal/biz/user/auth.go:21-26`），无脱敏中间件。
- **严重度**：高（凭证明文落盘 = 账号接管前提）
- **工作量**：小（把日志移到 `isDev` 分支内，或只打掩码 `code[:1] + "***"`）

---

### H9 — JWT 同时存 `localStorage` 与非 HttpOnly cookie，而 CSP 允许 `unsafe-inline` / `unsafe-eval`

- **落点**：
  - `src/lib/api-client.ts:69-71`（`localStorage.setItem` + `document.cookie = ... SameSite=Lax`，**无 HttpOnly**——`document.cookie` 写的必然无 HttpOnly）
  - `src/lib/api-client.ts:41-50`（双向同步逻辑）
  - `next.config.ts:34`（`script-src 'self' 'unsafe-eval' 'unsafe-inline'`，**非 dev 分支，恒定生效**）
- **什么坏了**：token 存在 JS 可读位置（`localStorage` 与 `document.cookie` 各一份），且 CSP 的 `script-src` 同时允许 `unsafe-inline` 与 `unsafe-eval`。任意一次 XSS（本仓库的技术栈里有 `rehype-raw`，其安全完全依赖 `rehype-sanitize` 的允许列表——`src/lib/markdown-sanitize.ts`）都能直接读走 token 并长期冒充用户。`'unsafe-eval'` 在**生产构建里也是开着的**，它只为 dev 需要。
- **验证**：读了 `next.config.ts:24-45` 与 `api-client.ts`。CSP 里 `extraConnectOrigins` 有 `isDev` 判断，说明作者知道要做环境区分——但 `script-src` 没有。`localStorage` 的注释（`api-client.ts:44-45`）解释了为什么写 cookie（给 SSR 读），但没解释为什么还要留 localStorage。
- **严重度**：中高（前提是存在 XSS；一旦存在则影响是账号接管）——**注意**：把 token 放 localStorage 是本仓库的既定架构（`AGENTS.md` 明确写了"JWT 存储在 `localStorage`，通过 cookie 同步"），所以**不应当**在无 ADR 的情况下单方面改掉；但 `'unsafe-eval'` 无条件开启是独立且可立即收紧的一项。
- **工作量**：`unsafe-eval` 收窄 = 小（`isDev ? "'unsafe-eval' 'unsafe-inline'" : "'unsafe-inline'"`）；token 存储形态 = 大，需先写 ADR

---

### H10 — 输入框与下拉框的错误信息不可被辅助技术感知

- **落点**：`src/components/ui/Input.tsx:114-116`

```tsx
{errorMessage && (
  <p className="text-xs text-danger">{errorMessage}</p>
)}
```

- 没有 `role="alert"`、没有 `id`、没有 `aria-describedby` 关联到 `:89-102` 的 `<input>`，也没有 `aria-invalid`。
- 同样的模式在 `ui/Textarea.tsx`、`ui/Select.tsx`（二者的实现同构）。
- **反面**：`label` 是**正确**的——`:60-67` 渲染 `<label htmlFor={id}>`，`id` 来自 `useId()`（`:54-55`）。所以这不是"无标签"，是"错误不可感知"。
- **影响面**：`errorMessage` 在 `ResumeMetadataPanel`、`ProviderFormModal`、`settings/**`、`admin/**` 等处使用；因为缺陷在原子组件里，**修一处即可覆盖全部调用点**。
- **验证**：读完了三个原子的实现。全仓 `aria-invalid` / `aria-describedby` **零命中**。
- **严重度**：中高（WCAG 3.3.1 错误识别 + 4.1.3 状态消息，Level A/AA）
- **工作量**：小

---

### H11 — 删除按钮只在 hover 时出现且无无障碍名

- **落点**：`src/components/ResumeCard.tsx:79-90`

```tsx
<Button ... isIconOnly size="sm" className="opacity-0 group-hover:opacity-100 ml-2" onClick={() => onDelete(id)}>
  <Trash2 className="w-3.5 h-3.5" />
</Button>
```

- `opacity-0` 的元素**仍可获得焦点**，所以 Tab 会落到一个看不见的按钮上（WCAG 2.4.7 焦点可见）；同时它没有 `aria-label`，屏幕阅读器只会念出一个没有名字的按钮（WCAG 4.1.2）。
- **验证**：逐行读了。`isIconOnly` 在 `ui/Button.tsx` 里**不影响**可访问名（`Button.tsx:99,123` 只控制尺寸），所以每个省略 `aria-label` 的调用点都是这个缺陷。
- **严重度**：中
- **工作量**：小

---

### H12 — 三个图标按钮没有无障碍名（全局导航）

- **落点**：`src/components/layout/Navbar.tsx:96-104`（设置）、`:106-114`（登出）、`:139-147`（移动端菜单开关）
- 三者都是 `Button isIconOnly`，子节点只有 lucide 图标（`Settings` / `LogOut` / `Menu`），没有文字、没有 `aria-label`。移动端菜单开关还没有 `aria-expanded`，菜单面板（`:150-237`）也没有 `role`/`aria-modal`。
- **反面**：`ResumePageClient:hover` 的 `toolbarButtonClass`（`:57-58`）走的是原生 `<button>` 并用 `title` 提供名称——这是**另一个**问题（`title` 不是可靠的可访问名），但至少形态不同。
- **验证**：读了 `Navbar.tsx:39-240`；`isIconOnly` 扫描给出了全仓 11 个调用点，其中 **8 个**缺少 `aria-label`（Navbar ×3、ResumeEditor ×4、ResumeCard ×1）——`Button.tsx` 自身 2 处与 `ResumeEditor.tsx:753/760/882/909` 已单独列出。
- **严重度**：中高（全局导航，每个页面都受影响）
- **工作量**：小

---

### H13 — 对话框无焦点管理（两个对话框组件都有）

- **落点**：
  - `src/components/ui/Modal.tsx:85-98`：有 `role="dialog"` + `aria-modal="true"` + `aria-label={title}`（:86-88）✓，有 Escape（:50-55）✓，有滚动锁（:63-64）✓ —— 但**没有**：打开时把焦点移入对话框、Tab 焦点环闭合、关闭时把焦点还给触发元素、背景 `inert`/`aria-hidden`。
  - `src/components/ui/ConfirmModal.tsx:61-104`：**连 `role` 都没有**。有 Escape（:31-36）✓、有背景点击关闭（:57）✓、**无滚动锁**、**无焦点管理**、标题（:75）没有与容器关联。
- **后果**：键盘用户 Tab 会从对话框跑到**背后的页面**（可以点到底层按钮），关闭后焦点回到 `<body>`（下次 Tab 从页面开头重新开始）。对 `ConfirmModal` 更严重：屏幕阅读器完全不知道这是一个对话框，也不知道它是模态的。
- **验证**：读完两个文件。全仓 grep `inert` / `.focus()` / `autoFocus` **零命中**——即没有任何一处做过焦点管理。`ProviderFormModal` 正确使用了 `aria-pressed`（:422）与 `aria-expanded`（:471），说明团队知道这些属性；缺的是模态那一层。
- **严重度**：中高（WCAG 2.4.3 焦点顺序，2.1.2 无键盘陷阱的反面；`ConfirmModal` 用于删除/可见性切换等破坏性操作）
- **工作量**：中（`Modal` 一次修好即可；`ConfirmModal` 应改为复用 `Modal` 或补上同等属性）

---

### H14 — `ui/Tabs` 用裸 `<button>` 实现，无 tab 语义

- **落点**：`src/components/ui/Tabs.tsx:51`（容器是 `<div>`，无 `role="tablist"`）、`:65-97`（每项是 `<button>`，无 `role="tab"`、无 `aria-selected`、无 `aria-controls`/`id` 关联面板）
- **后果**：屏幕阅读器把所有标签读成一排普通按钮，用户不知道哪个是"当前选中"，也不知道方向键应该切标签。视觉上的选中态靠 `text-foreground` + 一个 `motion.div` 指示条（:100-106）传达。
- **使用点**：`src/app/login/page.tsx`、`src/components/UploadPageClient.tsx`、`src/components/AtsPreview.tsx` —— 都是需要辨识选中态的地方。
- **验证**：读了 `Tabs.tsx:40-132`。
- **严重度**：中
- **工作量**：中（需要把 `id`/`aria-controls` 与面板配对）

---

### H15 — 所有 spinner 忽略 `prefers-reduced-motion`（含无限旋转）

- **落点**：`src/components/ui/Spinner.tsx:36`（`animate-spin`）、`ui/Button.tsx:130`、`ui/Autocomplete`— 不适用 —`AutosaveIndicator.tsx:70,75`、`ResumePageClient.tsx:574,606,625,644`、`AIUpload.tsx:625,851,962,997`、`AISectionChat.tsx:345,351,423`、`ProviderFormModal.tsx:339`
- 这些是 `animation: spin 1s linear infinite` 级别的**持续性**动画（WCAG 2.2.2 暂停/停止/隐藏，Level A），且完全不经 framer-motion，所以只修 `Animations.tsx` 覆盖不到它们。
- **重要**：`prefers-reduced-motion` 的**整体**覆盖正在被并发修改者处理——见 §3.4 与 §8-N5。我在 11:21:20 之后重跑测试时，`Animations.a11y.test.tsx` 的对应 `it.fails` 已转为通过，说明 framer-motion 那一半已经被修；**`animate-spin` 这一半（CSS 层）当时尚未覆盖**。
- **严重度**：中（`animate-spin` 是最典型的晕动症触发源）
- **工作量**：小（`globals.css` 里一条 `@media (prefers-reduced-motion: reduce) { .animate-spin { animation: none } }` 即可覆盖全部 17 处）

---

## 2. 性能问题

### 2.1 已确认的实现良好（先说负面结果，避免重复审计）

| 项 | 证据 | 结论 |
|---|---|---|
| `html2canvas-pro` 是否进主 bundle | `src/lib/export-pdf.tsx:355` `const { default: html2canvas } = await import('html2canvas-pro')` | **按需动态导入**，只在"导出图片"时加载 ✓ |
| `jspdf` 是否进客户端 | 仅 `src/lib/pdf-fixtures.ts:1`（测试夹具）引用 | **不在产物里** ✓（这是工单 03 把位图路线换成浏览器打印的收益） |
| 列表端点是否无界 | 工单 09 **确已实现**：`internal/biz/resumevault/resume.go:188` `DefaultListLimit=200`、`:200` `NormaliseListLimit`、`:460/473/484/497` 四处 `Limit(limit)`、`:516-545` 四个 `Count*`；审批侧 `internal/data/approval/approval.go:232` `Limit(limit)` | **有界** ✓。题面要求的"列出无分页端点"的答案是：**没有无界列表**，缺口是**无 offset/游标**（工单 30 范围） |
| 审批队列 200 条静默丢尾 | `internal/service/resumevault/approval.go:104-106` 发 `X-Approval-List-Truncated: 1`，`:111-112` 回 `total`/`truncated`，`:88-102` 三个独立 `Count` | 工单 09 备注里担心的"静默丢失"**已修** ✓ |
| 是否在 render 期创建组件（ESLint error） | `src/components/ResumeDisplay.tsx:237` `const Icon = getSectionIcon(kind)` | `getSectionIcon`（:50-66）返回 lucide 的**模块级稳定引用**，不是新组件工厂 → **不是缺陷**，ESLint 误报。附带的是 `SectionBlock` 的 `index` prop（:233）从未使用 → 死参数（§5） |
| 是否做了过早 memo 化 | 全仓 `useMemo` 集中在真正昂贵的派生值上（如 `ResumeDisplay.tsx:84` 的 `presentationFromRecord(resume.presentation)`，注释 :80-82 说明该组件因 `useScroll` 每帧重渲染） | **判断正确，无需清理** ✓ |

### 2.2 后端：N+1 与索引

见 §1-H3、§1-H4。度量方式：读调用链（handler → usecase → repo）+ 对 `Limit(`/`Find(`/`Count(` 做静态枚举。**未做** SQL 日志或 `EXPLAIN` 实测——本报告不含实际执行计划，`(visibility, approval_status)` 的"顺序扫描"结论来自"模型无该索引 + 迁移清单无该索引"这一**静态**事实，不是执行计划。若要坐实，需在 `internal/data/data.go` 的 `NewDB` 上打开 GORM `logger.Info` 或对 `ListPublicApproved` 跑 `EXPLAIN`（`unverified`）。

### 2.3 后端：列表端点清单

| 路由 | 集合？ | 有界？ | 分页？ |
|---|---|---|---|
| `GET /api/resumes` | 是 | 是（`NormaliseListLimit`，默认 200 / 上限 1000） | 无 offset/游标 |
| `GET /api/admin/approvals` | 是 | 是（`DefaultListLimit`） | 无 offset/游标 |
| `GET /api/admin/users` | 是 | **见下方说明** | — |
| `GET /api/admin/ai` | 是（`pendingRequests`） | 是（经 `PendingList`） | — |
| `GET /api/resumes/{id}/history` | 是 | 是（`versionLimit`，`SetVersionHistoryLimit` `resume.go:424`） | — |

> `admin/users` 一行标为"见下方说明"是刻意的：我**没有**把该 handler 读完，因此不对它的边界下结论（`unverified`）。上表中其余各行的依据分别是 `resume.go:200`、`approval.go:70`、`ai.go:919`、`resume.go:424`。

### 2.4 前端：重渲染与渲染期重活

- **H1 的循环是最严重的一项**：`useResumeAutosave` 的 effect 每次渲染都跑一遍完整 reducer + 对象展开。
- `src/contexts/AuthContext.tsx:119-130`：`value` 对象**每渲染重建**，没有 `useMemo`。`AuthProvider` 的每次 state 变化（登录、`refresh` 结果、`loading` 翻转）都会让**所有** `useAuth` 消费者重渲染，包括 `ResumePageClient`（`:232`）、`Navbar`（`Navbar.tsx:15`）、`AuthGuard`（`:23`）。当前消费者数量少、`AuthProvider` 状态变化也不频繁，所以这是**真实但低收益**的一项——**我不建议现在动它**（见 §9-D3）。
- `src/components/AIUpload.tsx:117-129`：一个 effect 依赖 `[stage, parsedMarkdown, chatMessages, history, file]`，每次 `parsedMarkdown` 变化（SSE 流式输出时**每个 token** 一次）都对整个会话做 `JSON.stringify` + `sessionStorage.setItem`。流式解析期间这是逐 token 的同步序列化。**这同时是数据安全问题**（§4-D1）。
- `src/components/AIUpload.tsx:144-146`：`chatEndRef.current?.scrollIntoView({behavior:'smooth'})` 依赖 `[chatMessages]`，流式期间同样逐 token 触发平滑滚动——与上一条叠加，是流式解析期间的主要卡顿来源。**未在浏览器中测量**（`unverified` 到具体毫秒），但触发条件是明确的。

### 2.5 包体积

**度量方式与限制**：我统计了 `node_modules/<pkg>` 的**解压目录总大小**，这只给出"安装了多大"，**不是**打包后的字节数（bundler 会 tree-shake 与压缩）。我**没有**运行 `next build`（理由见开头），所以**没有**任何可信的产物数字。以下判断只基于"谁 import 了它、import 了几处"。

| 依赖 | 解压体积 | 客户端可达？ | 证据 | 判断 |
|---|---|---|---|---|
| `framer-motion` | 4.6 MB | **是，32 个文件** | `from 'framer-motion'` 命中 32 个文件 | 最重的可达依赖。用途几乎全是入场/悬停装饰（`Animations.tsx`、`ResumeCard`、`Navbar`、`AIUpload`…）。**为一个装饰性效果承担一个大型动画运行时**，且它正是 H2（无 JS 白屏）的成因。工单 20/21 重构模板时应重估是否需要它 |
| `lucide-react` | 29 MB（整个图标库） | 是，33 个文件 | `from 'lucide-react'` 命中 33 个文件 | 库很大但按需 tree-shake，实际只打进用到的图标。**不是问题** |
| `react-markdown` + `remark-gfm` + `rehype-raw` + `rehype-sanitize` | 104 KB 合计 | 是 | `src/components/ResumeMarkdown.tsx:3-6`（`'use client'`），被 `ResumeDisplay.tsx:5` 使用 | 体积合理，且 `rehype-sanitize` 是安全必需。**保留** |
| `gray-matter` + `js-yaml` | 1.36 MB 合计 | **是** | `src/lib/resume-parser.ts:32`（`gray-matter`）+ `src/lib/resume-builder.ts:19`（`js-yaml`）；两者被 `ResumeEditor.tsx:15`、`ResumePageClient.tsx:18-23`、`TemplateThumbnail.tsx:46`、`ResumeBuilderPage.tsx:7` 等**客户端组件**导入，且这两个 lib 模块**没有** `'use client'`（即不会被自动踢出客户端图） | **值得注意**：YAML 解析/序列化整套进了客户端，而 `CONTEXT.md` §2 明确说"导入导出格式**不是运行时依赖**"。工单 17/18 之后 frontmatter 已降级为交换格式，因此**大部分客户端 YAML 使用可能是历史遗留**（`TemplateThumbnail` 为了渲染缩略图而解析示例 Markdown）。`unverified`：我没能确认产物里是否真的保留了它（无 build） |
| `date-fns` + `date-fns/locale` | 21 MB | 是，仅 3 处 | `src/components/ResumeCard.tsx:3-4` 用 `formatDistanceToNow` + `zhCN` locale | 为了两个函数引入日期库 + 中文 locale。本体 tree-shake 后不大，但**中文 locale 表**是这里的主要体积。`unverified`（无 build） |
| `html2canvas-pro` | 4.5 MB | 按需 | `export-pdf.tsx:355` 动态 `import()` | ✓ 好 |
| `jspdf` | 29 MB | 否 | 仅测试夹具 | ✓ 不在产物 |

---

## 3. 无障碍问题

> **重要前提**：仓库在审计期间**正在获得 a11y 覆盖**。`src/components/ResumeEditor.a11y.test.tsx` 与 `src/components/ui/Animations.a11y.test.tsx` 于 2026-10-14 11:20–11:21 被创建/修改。因此题面所述"ZERO coverage"在**观测时刻已不再成立**。下面把"已被 `it.fails` 固化的问题"与"尚未被任何测试覆盖的问题"分开列，避免把已有工作算作发现。

### 3.1 键盘可达性与可访问名（WCAG 2.1.1 / 4.1.2）

**尚未被测试覆盖：**

- **`Navbar.tsx:96-104` / `:106-114` / `:139-147`** —— 三个 `Button isIconOnly` 只有图标、无 `aria-label`。移动端菜单开关亦无 `aria-expanded`。见 §1-H12。
- **`ResumeCard.tsx:79-90`** —— 删除按钮无 `aria-label`，且 `opacity-0 group-hover:opacity-100` 让它在键盘聚焦时仍不可见（WCAG 2.4.7）。见 §1-H11。
- **`ResumeEditor.tsx:753`、`:760`、`:882`、`:909`** —— 四个 `Button isIconOnly` 无 `aria-label`（展开/折叠章节、删除条目、删除描述）。
- **`src/components/ui/Toast.tsx:75-80`** —— 关闭按钮只有 `<X>`，无 `aria-label`，无 `type="button"`。
- **`src/components/AIUpload.tsx:531`** —— 文件拖放区是 `<div onClick={() => fileInputRef.current?.click()}>`（`:527-537`），无 `role`、无 `tabIndex`、无键盘处理器。内部的 `<input type="file">` 是 `className="hidden"`（`:543`），**因此键盘用户无法触发文件选择**。这是文件上传主路径。
- **`src/components/ui/Switch.tsx:36`** —— `<button onClick=...>`，未看到 `role="switch"`/`aria-checked`（`Switch.tsx` 全文 56 行，`aria-*` 零命中）。使用点：`src/app/admin/users/page.tsx`。
- **`1.4.13`/焦点可见性**：`ui/Input.tsx:94` 的 `outline-none` 由父容器 `focus-within:ring-2`（:74）补偿 ✓；而 `ui/Button.tsx` 未定义任何 `focus-visible` 样式，浏览器默认 outline 也可能被全局样式覆盖——**未确认**（`unverified`：未在浏览器中实测焦点环）。

**已被 `it.fails` 固化（不要重复立项，只需在修复时转正用例）：**

- **模块拖拽排序无键盘替代**：`ResumeEditor.tsx:711`（`useDragControls`）、`:714-827`（`Reorder.Item`）、`:550-575`（`Reorder.Group`）；抓取手柄是 `<GripVertical>` 配 `onPointerDown`。证据与理由完整写在 `src/components/ResumeEditor.a11y.test.tsx:1-29`，并附一条读取 `node_modules/framer-motion/dist/es/components/Reorder/Item.mjs` 的**因果**断言（`:99-109`）。这是 WCAG 2.1.1 + 2.5.7。**我复核过该测试的断言与实现一致** ✓。

### 3.2 仅靠颜色传达含义（WCAG 1.4.1）

- **`src/lib/autosave-indicator.ts`** —— 状态标签通过色调区分；消费点 `src/components/AutosaveIndicator.tsx`。**部分良好**：有文字标签，不只是颜色。但 7 种状态里"已保存/未保存"的区分同时依赖颜色（`text-success` vs `text-default-500`）。**未确认具体色对与对比度**（`unverified`）。
- **`src/components/ui/Chip.tsx` 的 `dot` variant** —— 色点 + 文字。使用点 `ResumeCard.tsx:111-113` 传入了文字（`:32/35/37/39/41`），所以**不是**颜色单独表意 ✓。
- **`src/components/ui/Toast.tsx:63-67`** —— success/error 仅靠 `bg-success/10` vs `bg-danger/10` + 图标（`:69-73`）。图标不同，所以**有非颜色线索** ✓。
- **`src/components/TemplateSelector.tsx:184`、`:279`、`:288`** —— `rounded-md` 的小徽标，颜色 + 文字。
- **硬编码颜色绕过 token**：`text-white` 出现在 `TemplateSelector.tsx:122,135,241`、`AISectionChat.tsx:339,420`、`AIUpload.tsx:550,765,848`、`ResumeDisplay.tsx:244`、`Navbar.tsx:50`、`login/page.tsx:105`、`register/page.tsx:111`。这些是**纯白 `#fff`**（`white` 是 Tailwind 内建色，未被 `@theme inline` 覆盖），而 token 里 `--color-primary-foreground: #faf6f1`（暖奶油）。`AGENTS.md` 明令禁止 `#ffffff` 并给出映射 `#ffffff → #faf6f1`。在 `bg-primary` 上，暗色模式下 `--primary` 变成 `#8b9d77` 而 `--primary-foreground` 变成 `#1c1917`——**硬编码的 `text-white` 在暗色模式下既违反 token，也很可能是对比度不足的一对**。工单 08 未覆盖这些（`text-white` 不在它的验收 grep 列表里）。

### 3.3 表单（WCAG 1.3.1 / 3.3.2 / 4.1.3）

- **`label` 是好的** ✓：`ui/Input.tsx:60-67` 用 `htmlFor={id}` 与 `useId()`（:54-55）正确配对；`ui/Textarea.tsx`、`ui/Select.tsx` 同构。因此"输入框无标签"在本仓库**不成立**——这是个有用的负面结论。
- **错误信息不可感知（真实缺陷）**：见 §1-H10。全仓 `aria-invalid` / `aria-describedby` **零命中**。
- **`required`**：`aria-required` 零命中；未见原生 `required` 属性。

### 3.4 减少动效（WCAG 2.2.2 / 2.3.3）

- **状态（观测时刻 2026-10-14 11:21:41）**：`npx vitest run` 显示 `src/components/ui/Animations.a11y.test.tsx` 的 `it.fails('consults prefers-reduced-motion anywhere in src/')` **已变为通过**（该文件 11:21:20 被写）。也就是说 framer-motion 那一半（`FadeIn`/`ScrollReveal`/`StaggerContainer`）**刚被修**。请以该文件当前内容为准，不要照抄本行之前的结论。
- **仍未覆盖的部分（我确认过）**：**纯 CSS 的 `animate-spin` / `animate-pulse`**，共 17 处（`Spinner.tsx:36`、`Button.tsx:130`、`AutosaveIndicator.tsx:70,75`、`ResumePageClient.tsx:574,606,625,644`、`AIUpload.tsx:625,851,962,997`、`AISectionChat.tsx:345,351,423`、`ProviderFormModal.tsx:339`）。这些都是**无限重复**动画，`useReducedMotion()` 覆盖不到它们。`globals.css`（322 行）内无任何 `prefers-reduced-motion` 规则。见 §1-H15。

### 3.5 标题层级（WCAG 1.3.1 / 2.4.6）

**根因**：`src/components/layout/PageContainer.tsx:51` 输出 `<h1>`，且**仅在传入 `title` 时**渲染（`:47` 的条件 `(title || action)`）。全站只有三个页面容器不带 `title`——但其中两个（`ResumeBuilderPage.tsx:179`、`UploadPageClient.tsx:65`）确实传了 `title`（我的初次 grep 因上下文窗口过短而误判，已复核修正）。

| 位置 | 问题 | 证据 |
|---|---|---|
| `src/app/admin/layout.tsx:27` | 侧栏 `<h2>管理后台</h2>` 出现在**子页面 `<h1>` 之前**（DOM 顺序）。同一布局内还有 `:39` 的第二个 `<h2>`。 | 读了 `admin/layout.tsx:14-55` |
| `src/components/ui/EmptyState.tsx:22` | 固定 `<h3>`。在 `PageContainer` 建立 h1 的页面上直接跳到 h3，**跳过 h2**。 | 使用点：`DashboardClient.tsx:80`、`app/my/page.tsx`、`ResumeHistoryPanel.tsx` |
| `src/components/AtsPreview.tsx:138` | `<h3>`，同上跳级。 | 在 `/resume/[slug]` 的 ATS 视图内 |
| `src/components/ResumeMetadataPanel.tsx:166` | `<h3>基本信息</h3>`，在编辑器内，父级无 h2。 | — |
| `src/components/DashboardClient.tsx:49` | `<PageContainer title="公共" titleAccent="简历">` **确实**产出了 h1 ✓。 | 复核修正 |
| ✓ 良好 | `src/components/ResumeMarkdown.tsx:101-112` 把 Markdown `h1→h3`、`h2→h4`、`h3→h5`、`h4→h6` **刻意降级**，使简历正文的标题永远嵌在页面标题之下。这是正确的做法，且是全仓最容易被误判为"跳级"的地方。 | `ResumeMarkdown.tsx:101-112` |
| ✓ 良好 | `ResumeDisplay.tsx:166`（h1 姓名）、`:246`（h2 章节）、`:293`（h3 条目标题）层级正确。 | — |

### 3.6 动态内容的播报（WCAG 4.1.3）

- ✓ `src/components/AutosaveIndicator.tsx` 使用了 `role="status"` + `aria-live="polite"`（工单 14 记录，`14-autosave.md:108`）——**这一处做对了**。
- ✓ `src/components/ResumeBuilderPage.tsx:194` 有 `role="status"`。
- ✗ `src/components/ui/Toast.tsx:50-86` —— `ToastContainer` **无** `role="status"` / `aria-live`。成功/失败提示对屏幕阅读器完全静默。这是最常用的一条用户反馈通道（删除、保存、导出、权限）。
- ✗ `src/components/ui/Spinner.tsx` —— 分析 `Spinner.tsx:36` 的内容，未见 `role="status"`；`label` prop 的文本（`DashboardClient.tsx:75` 传 `"加载中..."`）不保证被播报。
- ✗ SSE 流式输出（`AIUpload.tsx`、`AISectionChat.tsx` 的对话区）无 `aria-live`，流式文本不会被播报。

### 3.7 图片与语言（WCAG 1.1.1 / 3.1.1）

- ✓ `html lang="zh-CN"` 正确（`src/app/layout.tsx:25`）。
- ✓ `ResumeMarkdown.tsx:147-150` 的 `<img>` 有 `alt={alt ?? ''}`（空 alt 是装饰图的正确处理）。
- ? `src/components/ui/Avatar.tsx:30` 的 `getInitials` —— **未读完**该文件，不判断其可访问名（`unverified`）。
- ? 简历正文里的英文内容（公司名、技能）没有 `lang` 标注。影响很小，**不建议动**。

---

## 4. 数据安全与错误处理

### 4.1 静默吞掉的错误

**空 catch（正则确认只有 3 处）：**

| 位置 | 内容 | 评价 |
|---|---|---|
| `src/components/AIUpload.tsx:113` | `catch { /* ignore */ }` 包住 `sessionStorage.getItem` + `JSON.parse` | **可接受**：解析损坏的本地草稿后从空白开始是合理降级。但它不清理那个损坏的 key，所以每次挂载都会再失败一次。**低** |
| `src/components/AIUpload.tsx:127` | `catch { /* ignore */ }` 包住 `sessionStorage.setItem` | **可接受**：配额超限（PII 会话很大时真会发生）时静默失败——但见 §4.2，用户以为草稿被保存了。**中** |
| `src/components/AIUpload.tsx:132` | `catch { /* ignore */ }` 包住 `removeItem` | 可接受 **低** |

**语义上静默（不为空但把失败变成"没有"）：**

| 位置 | 什么被吞掉 | 后果 |
|---|---|---|
| `src/components/ResumePageClient.tsx:248` | 权限重新拉取的全部失败 | 编辑按钮不出现且无解释 → §1-H6 |
| `src/components/DashboardClient.tsx:31-34` | 列表请求失败 → `setResumes([])` | 用户看到"暂无公共简历"（`:83`）而不是"加载失败"。**无法区分"没有数据"和"请求失败"** |
| `src/app/my/page.tsx:45-48` | 同上（`/api/resumes?scope=mine`） | 用户看到"还没有简历"——**这会让人以为自己的简历被删了**。**高**（因为 `my` 是用户确认自己数据在不在的地方） |
| `src/components/AuthContext.tsx:48-51` | `/api/auth/me` 失败 → `setUser(null)` + `clearToken()` | **网络抖动会被当成"未登录"并清掉 token**。用户被登出，且需要重新登录。**中高** |
| `internal/biz/approval/approval.go:659-662` | `h.Resolve` 失败 → 返回空 map | 审批队列某行悄悄少掉简历标题/slug，管理员看到一堆没有标题的申请 |
| `internal/biz/resumevault/resume.go:895` | 内容已保存但版本快照失败 → 只 `Errorf` | `UpdateResumeContent` 已提交内容却没能记版本：乐观锁的 `version` 与历史记录**不再对应**。这条日志是唯一的痕迹。**中高**（数据一致性） |

### 4.2 数据丢失风险

- **D1｜简历正文与对话历史被写入 `sessionStorage`**（PII）：`src/components/AIUpload.tsx:120-128`，key 见 `:102`。序列化内容包含 `parsedMarkdown`（完整简历正文）、`chatMessages`（AI 对话，可能含用户粘贴的更多个人信息）、`history`（每次 AI 改写的全文快照）、`fileName`。写入触发在 `:117-129`，依赖 `[stage, parsedMarkdown, chatMessages, history, file]` → **流式解析期间每 token 一次**。后果：(a) 简历 PII 与 token 同域可读（同 §1-H9）；(b) 无上限，长会话会撞 `QuotaExceededError` 而 `:127` 静默吞掉，但共享标签页里的任何脚本仍可读取已写入的那部分。**中高**
- **D2｜未保存的编辑在站内导航时无声丢失**：`src/hooks/useResumeAutosave.ts:334-343` 的守卫**只**注册 `beforeunload`（`:341`）。站内跳转（`Navbar` 的 `<Link>`、浏览器返回、`ResumePageClient` 的返回按钮）**不触发** `beforeunload`，于是 `< 1500ms` 防抖窗口内的编辑（`debounceMs` 默认 1500）或重试退避期间的编辑会被丢弃，且**没有任何提示**。`useResumeAutosave.ts:19-20` 的注释把"关标签页"当作唯一场景，这解释了为什么只做了 `beforeunload`。**中高**（工单 14 的验收标准只覆盖了"关闭页面前"）
- **D3｜不可重试失败之后草稿的可见性**：`autosave-machine.ts:203-204` 让 `disabled` 保留 `savedText`（`:278-280` 的测试确认了这一点 ✓），冲突路径也让 `savedText` 保持服务端旧值（工单 14 记录 ✓）。**这两条是好的**。但 `stopped: true` 之后用户若忽略提示继续编辑，草稿仍在内存里、也仍在 `beforeunload` 保护下——**这一条经查是安全的** ✓
- **D4｜乐观更新**：`src/app/my/page.tsx:66-84` 的删除先发请求再改列表（`:71-72`），失败时 `:74-77` 给出错误且**不改列表** → **没有不回滚的乐观更新** ✓。`ResumeEditor` 的章节重排是纯本地 state，仅通过保存落库。
- **D5｜`MetadataPatch` 并发**：`ResumePageClient.tsx:355-396` 用 `resume` 里的 `version` 做乐观锁，冲突时 `:377-379` 设置 `conflict` 并 `:390` 重新抛出。**这条路径正确** ✓

### 4.3 PII 是否进 URL / 日志

- **URL**：`useSearchParams` 只有 2 处（`app/login/page.tsx:21` 与另一处登录页），拼的是 OAuth 回调参数，**不含简历内容** ✓。`api-client.ts:404` 的 `URLSearchParams` 用于列表查询参数。**未发现把简历内容/邮箱/token 拼进 query string 的地方** ✓（这是重要的负面结论）
- **前端 console**：只有 2 处，且都是 `console.error` 带 `Error` 对象、不带简历内容：`usePdfExport.tsx:42,54` ✓
- **后端日志**：**`internal/biz/user/auth.go:291` 打印验证码明文** → §1-H8。另外 `internal/server/http.go:89` 在错误路径打印 `r.URL.Path`（不含 query，也不含 body）✓。

---

## 5. 重复与死代码

### 5.1 `readSSEStream`：**已经不是三份重复了**（重要更正）

题面（与工单 14 的备注、市场调研 §5.6 第 3 条）都说有三份重复副本。**实测：三份已经在 `src/lib/sse.ts`（174 行）收敛完毕。**

证据：
- 全仓 `getReader()` 只有 **1 处**：`src/lib/sse.ts:68`。真正的流式读取循环不可能少于这个数。
- `src/components/AISectionChat.tsx:9` → `import { readSSEStream } from '@/lib/sse'`
- `src/components/ResumeBuilderPage.tsx:6` → `import { readSSEText } from '@/lib/sse'`
- `src/components/AIUpload.tsx:12` → `import { readSSEStream as readSSEStreamShared } from '@/lib/sse'`

**仍然存在的一处小重复**：`src/components/AIUpload.tsx:186-196` 保留了一个名为 `readSSEStream` 的**局部包装函数**（5 行），把 `onNotice` 与 `idleTimeoutMs` 绑好。它有存在的理由（两个调用点共享这两个选项：`:231`、`:332`），并且**它调用的是共享实现**，所以不会漂移。`sse.ts:47-61` 还特意用重载把历史上 `(res, onChunk)` 的错误调用形态变成**编译错误**，说明这次收敛是有意设计的。

**统一化的真实成本**：**已付清**。剩余工作量为零（顶多把 `AIUpload` 那个包装内联掉，收益是 5 行）。

**真正的缺口不是重复，而是 `sse.ts` 没有任何测试**（`src/lib/sse.test.ts` 不存在）。见 §6-T2。`sse.ts:1-17` 的注释自己说明了这份收敛修掉了什么真实缺陷（旧的三份只消费 `content`，静默丢掉 `error`，把中途失败伪装成成功），而这条修复**目前没有回归保护**。

### 5.2 死代码 / 未使用

| 位置 | 内容 | 证据强度 |
|---|---|---|
| `src/components/ResumeEditor.tsx:169` | `const [frontmatter, setFrontmatter]` —— **题面点名的例子，确认成立**。它只被读进 `editableToMarkdown(frontmatter, sections, { includeFrontmatter: false })`（`:222`、`:393`）。**`includeFrontmatter: false` 意味着输出与 `frontmatter` 无关**；`setFrontmatter` 唯一调用点是 `:202`（`resetToken` 重置）。因此这是一个完整的 state 及其重置逻辑，对任何输出都没有影响。`ResumeEditor.tsx:218-221` 的注释解释了为什么不再输出 frontmatter，`resume-builder.ts` 的 `editableToMarkdown` 需要该参数——但**没有**解释为什么还要保留这个 state 并给它建重置路径。 | **已确认**（读了三处代码 + `setFrontmatter` 全仓唯一调用点） |
| `src/components/ResumeSplitEditor.tsx:15`、`:18` | props `markdown` 与 `onParsedChange`：在 `:27`、`:30` 被解构，**在整个函数体内从未被引用**（该文件 196 行，除解构处外无出现）。ESLint 对二者各报一条 warning。也就是说 `ResumeSplitEditorProps` 的接口比自己实现的契约大——调用方（`ResumeBuilderPage.tsx:200-...`）以为自己传了一个受控的 markdown 和解析结果回调，实际都被忽略，真正的数据流走 `onMarkdownChange`（`:123-124`）。 | **已确认** |
| `src/components/ResumeDisplay.tsx:233` | `SectionBlock` 的 `index` prop 从未使用（ESLint warning）。调用方 `:214` 仍在传。 | 已确认 |
| `src/components/ui/Input.tsx:3` | `useState` 导入但未使用（ESLint warning） | 已确认 |
| `src/components/ui/Toast.tsx:3` | `useEffect` 导入但未使用（ESLint warning） | 已确认 |
| `src/components/ui/Card.tsx:3`、`ui/Textarea.tsx:3` | `ReactNode` 导入但未使用（ESLint warning ×2） | 已确认 |
| `src/components/ui/Select.tsx:21` | `variant` 被赋值（有默认值）但从未使用 → `ui/Select` 的 `variant` prop 是**无声失效的**：传 `bordered` 或 `underlined` 不改变任何样式。这是一个**接口谎言**，不只是死代码。 | 已确认 |
| `src/components/AISectionChat.tsx:6`、`:245` | `X` 未使用；`let content` 应为 `const` | 已确认（ESLint） |
| `src/components/ui/ConfirmModal.tsx:52`、`:65` | `transition={{ duration: 0.2 }}` / `0.25` —— 违反 `AGENTS.md`「动画节奏：`duration-500` 以上」，工单 08 的验收只 grep 了 class 名（`duration-200`），**没覆盖 framer-motion 的数字**。 | 已确认 |
| `src/components/ui/Toast.tsx:59`、`Navbar.tsx:43`、`ResumeCard.tsx:68`、`ResumePageClient` 内多处 | 同上，framer-motion `duration` 为 `0.25`/`0.4`/`0.2` | 已确认 |

**未发现**：导出的顶层函数没有任何一个"零引用"（脚本枚举了 `src/**` 的全部 `export function` / `export const`，无命中）。导出的 UI 原子组件全部至少有一个应用内使用点（`Pressable`/`Switch`/`Tabs`/`Divider`/`Modal`/`Chip` 等都查过）。**这条负面结论值得记录**：本仓库的死代码集中在**局部未使用变量**与**失效的 prop**，不在"整文件没人渲染"。

### 5.3 必须与另一处保持同步的手写清单（静默漂移源）

| 前端 | 后端对应物 | 漂移后的表现 |
|---|---|---|
| `src/lib/list-limit.ts:23` `RESUME_LIST_DEFAULT_LIMIT = 200` | `internal/biz/resumevault/resume.go:188` `DefaultListLimit = 200` | UI 文案 `:94` 写出错误的"单次上限 N 份" → §1-H7 |
| `src/lib/list-limit.ts:26` `APPROVAL_LIST_DEFAULT_LIMIT = 200` | `internal/biz/approval/*` 的 `DefaultListLimit` | UI 文案 `:106` 同上。**两个前端常量分别是两个后端常量的手抄本** |
| `src/lib/resume-metadata.ts:80-94` `METADATA_FIELDS` / `METADATA_KEYS` | `resumes` 表列 + Go 侧 `MetadataFieldOrder()`（`internal/biz/resumevault/resume.go:1042`）+ `metadata_validation.go` | `:14` 的注释自称镜像服务端规则。新增一个字段（工单 26 中文特有字段 + 自定义字段）需要改 3 个地方 |
| `src/lib/resume-metadata.ts:121` 客户端邮箱正则 | `internal/biz/resumevault/metadata_validation.go` | 注释自己称"deliberately loose email check, mirroring the server's"——两边都属于"故意宽松"，但**没有任何机制保证两边同时改** |
| `src/lib/resume-parser.ts:398`、`:619` | Go 解析器的 `dateCandidate` / `looksLikeDate` / `stripDateOnlyLines` | `:398` 注释明确说"mirrors the server's ... gate, which matters more"。**存在 parity 测试**（`src/lib/resume-parser-parity.test.ts`，25 例、夹具 `src/lib/__fixtures__/server-parser.json`）——这是本仓库**唯一**为这类漂移建了机制的地方，应作为其余四条的模板 ✓ |
| `src/lib/resume-presentation.ts:136`、`:249`、`:738` | Go 的 `PresentationLimits` / `parseHexHSL` / `containsString` | 同样**有** parity 测试（`resume-presentation-parity.test.ts`，43 例）✓ |

**结论**：`resume-parser` 与 `resume-presentation` 的漂移问题**已经用 parity 测试解决了**，是正面案例；**`list-limit` 与 `resume-metadata` 没有**，是真实缺口。这两处的共同修法是同一个：让后端在响应里携带权威值/字段表，或复制 parity 测试的模式。

### 5.4 设计规范违规（工单 08 之后残留）

- `text-white`（= `#ffffff`，被 `AGENTS.md` 明令禁止）：11 处，见 §3.2。
- `border-2`：`ui/Button.tsx` 的 `bordered`/`ghost` 变体共 10 处（`:28,30,35,37,42,44,49,51,56,58,63,65`）+ `ResumeStartScreen.tsx:358,421`（虚线拖放区）。工单 08 的备注（第 183 行）**自己记录了这一点并声明未处理**，所以这属于"已知且故意搁置"→ §9。
- `rounded-xl` / `rounded-md` / `rounded-lg`：`Navbar.tsx`（6 处）、`TemplateSelector.tsx`（4 处）、`AISectionChat.tsx`（5 处）、`AIUpload.tsx`（5 处）、`Tabs.tsx`（4 处）等。规范映射表要求 `rounded-xl` → `rounded-[2rem]`（卡片）或 `rounded-full`（按钮/输入框）。工单 08 备注第 183 行同样记录了 `sizeSelector.tsx` 的 `rounded-md` 属**未处理**。
- `shadow-sm shadow-primary/20`（`TemplateSelector.tsx:122,135`）：`shadow-sm` 合规，额外色影不违反明文禁令。
- `@media print { html, body { background: #ffffff } }`（`globals.css:307`）：纯白，但打印用纸是白的，**故意** → §9。
- **未发现**：`shadow-md/lg/xl/2xl`、`bg-gradient-to-*`（`.gradient-text` 之外）、`text-blue-*`/`text-purple-*`/`text-cyan-*`/`text-indigo-*` —— 工单 08 的验收标准**当前成立** ✓（这三条是它真正做成了的部分）

---

## 6. 测试缺口（按影响面排序）

**基线**：`npx vitest run` @ 2026-10-14 11:21:41 → **25 passed | 1 skipped（文件）**，**735 passed | 6 expected fail | 1 skipped（用例）**，8.06 秒。`it.fails` 分布：`resume-builder.test.ts` ×2、`resume-parser.test.ts` ×3、`ResumeEditor.a11y.test.tsx` ×2、`Animations.a11y.test.tsx` ×2（后两者在审计期间变化，以当前文件为准）。

### T1 — `useResumeAutosave`（375 行，零直接测试）→ **最高影响面**

- **缺口**：`src/hooks/useResumeAutosave.ts` 没有测试文件。`autosave-machine.test.ts`（22 例）、`autosave-failure.test.ts`（15 例）、`autosave-indicator.test.ts`（14 例）测的都是**纯函数**，而这个 375 行的 hook 才是把 reducer 接到 React 生命周期上的地方——**H1 的无限循环就活在这一层，51 条测试一条都没碰到它**。
- **为什么这是"实现细节 vs 行为"的教科书案例**：`autosave-machine.test.ts:268-282`（`re-enables after a guest session ends`）确实覆盖了 `disabled` 事件，断言的是 `status` 与 `savedText` 两个**字段值**——它们都是对的。它**没有**断言 reducer 在状态未变时返回原引用，而这正是该 reducer 能否被放进一个以 `state` 为依赖的 effect 的前提。reducer 单独看是正确的，接上 React 就错了。
- **具体建议的回归用例**（不依赖 DOM，`node` 环境即可）：
  ```
  it('returns the same object when `disabled` cannot change anything', () => {
    const disabled = applyAutosaveEvent(initialAutosaveState(), { type: 'disabled' });
    expect(applyAutosaveEvent(disabled, { type: 'disabled' })).toBe(disabled);
  });
  ```
  这条用例当前会**失败**（`autosave-machine.ts:204` 每次都 `{...state}`），修好 H1 后自动转绿。
- **工作量**：小（一条 reducer 用例值得写；用 `react-dom/server` + `happy-dom` 测 hook 则需中等）

### T2 — `src/lib/sse.ts`（174 行，零测试）→ 高

- 一个手写的 SSE 线协议解析器：缓冲、按行切分、`data: ` 前缀、三种帧（`content`/`notice`/`error`）+ `[DONE]`、空闲超时竞速（`:123-139`）、`AbortSignal` 清理（`:154-158`）、末帧无换行兜底（`:148-153`）。
- `sse.ts:1-17` 的注释说明**这份收敛修掉了一个真实缺陷**（三份副本静默丢弃 `error`，把中途失败伪装成成功）。**修复本身没有回归保护**——任何一次改动都可能悄悄把 `error` 再丢一次。
- 它是纯的、易测的（喂一个 `new Response(stream)` 即可），且**唯一的实现**服务三个组件。
- 相关：`AIUpload.tsx:113` 那个吞掉 `JSON.parse` 失败的 `catch`、`sse.ts:83-87` 吞掉畸形帧的 `catch`，都需要一个"畸形输入不得让流卡死也不得静默变成成功"的用例。
- **工作量**：小

### T3 — `src/lib/api-client.ts`（475 行，零测试）→ 中高

- 每个页面都用它，且它含有**纯且易测**的部分：token ↔ cookie 同步（`:39-51`、`:65-77`）、`getToken` 每次重读 localStorage 的语义（`:53-63`）、`Content-Type` 与 `FormData` 的互斥（`:102-104`）、`readError` 的兜底文案。
- 全仓唯一的鉴权真相来源，且 H9 就落在这里。`happy-dom` 下 `localStorage`/`document.cookie` 可用，测试成本低。
- **工作量**：小

### T4 — `src/lib/markdown-sanitize.ts`（82 行，零直接测试）→ 中（安全）

- 防存储型 XSS 的允许列表（`markdown-sanitize.ts:72` 的注释自己点名"Since `rehype-raw` is in the pipeline, that is a stored-XSS ..."）。
- 它**有**间接覆盖：`src/components/ResumeMarkdown.test.tsx`（48 例）跑的是真实的 `rehypeRaw → rehypeSanitize` 管线（`ResumeMarkdown.tsx:62-64`），所以破坏 schema 会被发现。**但**该测试测的是"经过管线后 HTML 长什么样"，不是"schema 允许/拒绝了哪些具体标签/属性"——**新增一个危险属性白名单项**可能不会被它抓到。
- **工作量**：小（针对 schema 的拒绝清单写表驱动用例）

### T5 — `src/lib/resume-list.ts`（36 行）+ `list-limit.ts`（107 行）→ 中

- `list-limit.test.ts` 有 18 例 ✓ 覆盖了 `buildListLimitNotice` 的判定逻辑。
- **但**：`resume-list.ts`（`readResumeList`，被 `DashboardClient.tsx:27` 与 `app/my/page.tsx:41` 使用，负责解析后端可能缺失 `total`/`truncated` 的响应）无测试。工单 09 的实测记录提到旧二进制返回 `{}` 会被读成"0 份、未截断"——**这个具体场景值得一条用例**。
- **工作量**：小

### T6 — 会"即使功能坏了也通过"的测试

| 位置 | 问题 |
|---|---|
| `src/lib/verify-template-browser.test.ts:78` | `describe.skipIf(!process.env.VERIFY_TEMPLATE)` —— **无条件跳过**（`npm run test` 不设该变量）。文件内 1 条用例，是 `npm run verify:template` 的门禁。**这不是缺陷**：`:11-16` 的注释明确解释了为什么必须跳过（需要真实 Chromium，太慢、无浏览器时直接失败），且 `npm run verify:template` 会设置该变量。**属"故意"** → §9 |
| `src/lib/autosave-machine.test.ts:268-282` | 见 T1：断言字段值而非引用/行为契约，是这个 reducer 被误用的直接原因。（不是"无意义断言"，是**断言层次错了**） |
| `src/components/ResumeEditor.a11y.test.tsx:99-109` | 断言 `node_modules/framer-motion/.../Item.mjs` 的源码里没有 `onKeyDown|tabIndex`。设计意图良好（`:100-102` 有解释），但它是**对依赖实现的断言**：framer-motion 重构（把逻辑移到 `useReorderItem` 之类的 hook）会让它失败而缺陷依旧存在。**低**（有注释说明这是刻意的） |
| 全仓 `it.fails`（6 条） | **设计正确**（`AGENTS.md` 有明文规定，`Animations.a11y.test.tsx:44-49` 还专门说明"一个悄悄成功的 `it.fails` 比没有测试更糟"）。我在审计期间**亲眼见到**其中一条从 `it.fails` 转为通过（并发修改者修好了 reduced-motion），说明这套机制**真的在工作** ✓ |

**未发现**：`.only`（零命中）、`.todo`/`xit`/`xdescribe`（零命中）、`expect(true).toBe(true)`（零命中）。**这三条是重要的负面结论** ✓

### T7 — 有真实逻辑但无测试的模块（按影响面排序，仅列未覆盖的）

1. `src/components/ResumeEditor.tsx`（938 行）—— 只有 a11y 测试（4 例），无行为测试。它是数据丢失风险最集中的地方。
2. `src/lib/api-client.ts`（475 行）→ T3
3. `src/hooks/useResumeAutosave.ts`（375 行）→ T1
4. `src/components/AIUpload.tsx`（1012 行）—— 零测试，且含 §1-H5、§4.2-D1
5. `src/lib/sse.ts`（174 行）→ T2
6. `src/components/ai/ProviderFormModal.tsx`（581 行）—— 零测试；含密钥输入、模型行增删
7. `src/lib/markdown-sanitize.ts`（82 行）→ T4
8. `src/lib/resume-starters.ts`（235 行）、`resume-template-seeds.ts`（386 行）—— 内容常量，影响低
9. `src/lib/pdf-fixtures.ts`（122 行）—— 本就只服务测试

（`app/**` 页面与 `ui/**` 原子按 `AGENTS.md` 的约定"只测纯逻辑"可由 E2E 覆盖，本报告不计入缺口。但 `ui/Input`/`ui/Modal`/`ui/Tabs` 的 ARIA 契约应当有测试——见 §3 的 H10/H13/H14。）

---

## 7. 可观测性现状

### 7.1 前端：**没有**任何错误上报

- **没有错误边界**：`src/app/` 下**不存在** `error.tsx` / `global-error.tsx` / `not-found.tsx`（文件系统列出确认，零命中）。任何渲染期异常都会冒泡到 Next 的默认错误页，**组件树状态全部丢失**，用户看到的是通用错误页，而**服务端不会收到任何该错误已发生的信号**。
- **没有错误追踪 SDK**：`Sentry` / `window.onerror` / `unhandledrejection` / `reportError` 全仓**零命中**。唯一的 `addEventListener('error', ...)` 是 `src/lib/export-pdf.tsx:303`，挂在打印 iframe 上做局部降级提示。
- **没有结构化日志**：全仓 `console.error` 只有 2 处（`usePdfExport.tsx:42,54`），且仅在浏览器控制台，**不离开用户设备**。
- **没有性能指标**：无 `web-vitals`、无自定义 timing。
- **`next.config.ts`** 未配置任何 telemetry/tracing 上报（只有安全头与 rewrites）。

### 7.2 后端：有日志器，**没有**请求 ID、没有追踪、没有指标

- **有**：Kratos 标准 logger，经 `log.NewHelper` 注入（如 `internal/service/user/user.go:22`、`internal/biz/resumevault/resume.go:420`）。错误路径会在 `internal/server/http.go:89` 打一行结构化度尚可的 `[HTTP] %s %s → %d: %s (reason=%s)`（方法/路径/状态码/消息/reason）。panic 有 `recovery` 中间件捕获并记 `[PANIC]`（`:36-41`）。
- **没有**：
  - **请求 ID**：`internal/server/http.go:33-52` 的中间件链只有 `recovery.Recovery()` + 两个 `Filter`。全仓 grep `requestid|RequestID` **零命中**（Kratos 自带 `middleware/tracing` 与 `middleware/metadata`，未使用）。后果：**无法把一次请求的多条日志、或多服务间的一次调用串起来**。
  - **分布式追踪**：无 OpenTelemetry。grep `otel|trace.` 仅命中 `internal/conf/conf.pb.go:555` 的 protobuf 生成代码。
  - **指标**：无 Prometheus/`metrics` middleware。无法回答 QPS、P50/P99 延迟、错误率、DB 连接池饱和度、AI 调用耗时分布。
  - **成功请求不记日志**：`errorEncoder` 只在**返回错误**时打日志。成功的请求完全无痕，所以**没有 QPS、没有延迟、没有慢查询证据**。

### 7.3 因此**在生产环境中无法诊断**的具体事项（量化）

| 问题 | 现在能看到什么 | 看不到什么 |
|---|---|---|
| **H1 的渲染循环** | 只在**用户自己的浏览器控制台**里。前端的 "Maximum update depth exceeded" 不会被上报。 | 有多少用户受影响、发生在哪个简历页、是否与某个模板/浏览器相关。**只有用户抱怨才知道存在。** |
| 任何客户端异常 | 只有 Next 默认错误页 | 堆栈、发生次数、影响的用户与页面 |
| 某个 API 变慢/变慢了多少 | 只有失败请求的一行 `[HTTP] ... → 500` | **成功请求的延迟分布**。工单 09 引入的额外 `COUNT` 查询、H3 的 205 条 SQL，性能退化**不可观测** |
| **H3 的 N+1** | GORM 的慢查询日志（若开了） | 因为没有请求 ID，看到 200 条 `SELECT ... FROM resumes WHERE id=$1` 也**无法归因到是哪个端点、哪个用户** |
| H8 的验证码泄漏 | 日志里有明文，但**没有审计** | 谁读过日志、是否有异常登录。JWT 无 `jti`、无会话表，**无法撤销单个 token** |
| 前端某个轰然崩掉的路由 | 无 | 无 |

**一句话**：后端有"点"级日志（一行错误），前端有"零"级（什么都没上报）。两者之间唯一的关联键是 `r.URL.Path`，**没有请求 ID**，所以一次失败的用户操作无法端到端还原。

---

## 8. 查过但**没问题**的（不要重复审计）

| # | 检查项 | 结论与证据 |
|---|---|---|
| N1 | **列表端点是否无界** | **不是。** 工单 09 已落地：`internal/biz/resumevault/resume.go:188/200`（`DefaultListLimit=200` / `MaxListLimit=1000` / `NormaliseListLimit`）、`:460/473/484/497` 四处 `Limit(limit)`、`:516-545` 四个 `Count*`、审批侧 `internal/data/approval/approval.go:232`。真正缺的是 **offset/游标**（工单 30 范围），不是上限 |
| N2 | **审批队列静默丢尾** | **已修。** `internal/service/resumevault/approval.go:104-112` 返回 `total`/`truncated` 并加 `X-Approval-List-Truncated` 头。工单 09 备注里担心的那一条已不成立 |
| N3 | **`html2canvas-pro` 进主 bundle** | **没有。** `src/lib/export-pdf.tsx:355` 是 `await import('html2canvas-pro')`，按需加载 ✓ |
| N4 | **`jspdf` 进客户端产物** | **没有。** 全仓唯一 import 是 `src/lib/pdf-fixtures.ts:1`（测试夹具）✓ 这是工单 03 的收益 |
| N5 | **`prefers-reduced-motion`（framer-motion 部分）** | **审计期间刚被修**（`Animations.a11y.test.tsx` 在 11:21:20 被写，其对应 `it.fails` 于 11:21:41 的运行中转为通过）。**纯 CSS 的 `animate-spin` 部分仍未覆盖**（§1-H15）。动手前请重读该文件 |
| N6 | **拖拽排序无键盘替代** | **已被 `it.fails` 固化**（`ResumeEditor.a11y.test.tsx:76-97`），且有因果断言（`:99-109`）。**不需要重新发现**，只需要在修复时把用例转回 `it`。我复核了断言与 `ResumeEditor.tsx:711/714/550` 的实现一致 ✓ |
| N7 | **`ui/Input`/`Textarea`/`Select` 是否缺 label** | **不缺。** `ui/Input.tsx:54-55`（`useId`）+ `:60-67`（`<label htmlFor={id}>`）正确配对；另两个同构。**问题只在 errorMessage 的 ARIA**（§1-H10）——不要把这两件事混为一谈 |
| N8 | **PII 进 URL / query string** | **没有。** `useSearchParams` 仅 2 处，拼的是登录/回调参数；简历内容、邮箱、token 都只在请求体或 header 里 ✓ |
| N9 | **PII 进前端 console** | **没有。** 仅 `usePdfExport.tsx:42,54` 两处 `console.error`，只带 `Error`，不带简历内容 ✓ |
| N10 | **`readSSEStream` 三份重复** | **已经收敛成一份。** 全仓 `getReader()` 仅 `src/lib/sse.ts:68` 一处；三个组件都从 `@/lib/sse` 导入（`AISectionChat.tsx:9`、`ResumeBuilderPage.tsx:6`、`AIUpload.tsx:12`）。题面/工单/调研文档的"三份"已过期。真正的缺口是它**没有测试**（§6-T2）。见 §5.1 |
| N11 | **`ResumeEditor` 的 `frontmatter` state** | **题面点名的例子成立**，但它是"读了也没用"而非"完全没读"：只喂给 `editableToMarkdown(..., { includeFrontmatter: false })`（`ResumeEditor.tsx:222`、`:393`），输出与它无关。详见 §5.2 |
| N12 | **乐观更新不回滚** | **没有这种模式。** `app/my/page.tsx:66-84` 的删除是"先请求再改列表"，失败时给出错误且不动列表 ✓ |
| N13 | **自动保存会不会丢草稿** | **冲突与不可重试失败路径是安全的** ✓：`autosave-machine.ts:203-204` 保留 `savedText`（`:278-280` 的测试确认），冲突分支只递增 `seq` 不改文本（工单 14 记录 + `autosave-machine.test.ts:196-205`）。**唯一的缺口是站内导航**（§4.2-D2） |
| N14 | **`ResumeDisplay.tsx:244` 的 ESLint error（"Cannot create components during render"）** | **误报。** `getSectionIcon`（`:50-66`）返回 lucide 的模块级稳定引用，不是组件工厂，引用身份跨渲染不变 ✓ |
| N15 | **是否为小功能引入了巨大依赖** | **在这个意义上没有。** 最重的可达依赖是 `framer-motion`（4.6 MB 解压 / 32 个文件），但它是**全站的基础动画层**（设计系统明确规定），不是"为一个小功能引入的"。`jspdf` 与 `html2canvas-pro` 都按需或不在产物里 |
| N16 | **设计与 token：暗色模式** | **正确。** `globals.css:72-120` 用 `@media (prefers-color-scheme: dark)` + 变量，符合 `AGENTS.md`「不使用 `dark:` 前缀」；`:123-...` 的 `@theme inline` 已注册 `--color-*` ✓。唯一瑕疵是 §3.2 的 `text-white` 绕过了 token |
| N17 | **`.only` / `.todo` / `xit` / 无意义断言** | **零命中。** 测试套件没有停用的用例、没有 `expect(true).toBe(true)` ✓ |
| N18 | **工单 08 的三条 grep 验收** | **全部成立** ✓：无 `shadow-md|lg|xl|2xl`、无 `bg-gradient-to-*`（`.gradient-text` 除外）、无冷色调实用类。（但它的验收清单**不包含** `text-white`、`border-2`、`rounded-xl`——见 §5.4） |
| N19 | **`getSectionGradient` / `.glass` / `.glow-primary` / `.resume-content` 死代码** | **已删除。** 工单 08 记录且我复核了 `ResumePrintView.tsx:29-32` 的说明注释存在 ✓ |
| N20 | **`resume-parser` / `resume-presentation` 的 Go↔TS 漂移** | **已有 parity 测试保护** ✓（`resume-parser-parity.test.ts` 25 例 + `resume-presentation-parity.test.ts` 43 例）。这是本仓库**做对了**的同步机制，应作为 §5.3 其余几条的模板 |

---

## 9. 不建议动的（看起来像问题，其实是刻意的）

| # | 看起来像问题 | 为什么是故意的 | 依据 |
|---|---|---|---|
| D1 | `ResumePageClient.tsx:57-79` 用原生 `<button>` 而不是 `ui/Button`，违反 `AGENTS.md`「禁止原生 `<button>`」 | 代码注释明确解释：`ui/Button` 的 `bordered` 变体硬编码 `border-2`（规范另行禁止），且它无法表达"方形内边距、无高度类"，走它反而会引入新的规范违规并改变工具栏布局。抽出 `ToolbarButton` 是为了让六个按钮定义一次（它们曾经漂移） | `ResumePageClient.tsx:60-69` |
| D2 | `src/lib/list-limit.ts` 与 `src/lib/resume-metadata.ts` 手抄后端常量 | **部分是故意的**：`list-limit.ts:16-19` 与 `:31-35` 解释了为什么字段可选（滚动部署期间浏览器可能遇到没有这些字段的旧后端，把"缺失"当"完整"比清空列表好）。**但**"数字需要漂移安全"这一点没有被解决，所以 §1-H7 仍然成立——这是"设计意图正确但机制缺失"，不是"故意不改" | `list-limit.ts:16-19, 28-35` |
| D3 | `AuthContext.tsx:119-130` 的 `value` 未 memo | 消费者少、`AuthProvider` 状态变化不频繁，收益低于 `useMemo` 的噪音。**现在不值得动** | §2.4 |
| D4 | `src/lib/verify-template-browser.test.ts:78` 无条件 skip | 需要真实 Chromium 与真实打印，放进单元套件会太慢且无浏览器时直接失败。`npm run verify:template` 会设置 `VERIFY_TEMPLATE` | 文件 `:11-16` 注释 + `package.json:14` |
| D5 | `ui/Button.tsx` 的 `border-2`（10 处）、`rounded-xl/md/lg`（多处）、`ResumeStartScreen.tsx:358,421` 的 `border-2 border-dashed` | 工单 08 的备注**自己记录**了这些并声明未处理，理由包括规范内部矛盾（`backdrop-blur` 同时出现在"禁止玻璃拟态"与"迁移映射表"里），需要产品/设计先明确。**不要在没有该决定前单方面改** | `.scratch/resume-platform/issues/08-design-violations.md:183-185` |
| D6 | 打印样式 `globals.css:307` 的 `background: #ffffff` 与整套打印 CSS **刻意不用 CSS 变量与 Tailwind 类** | `:286-292` 的注释解释：打印文档必须自包含（iframe 不继承父页样式表），且 ADR-0001 阶段四的渲染器明确不支持 CSS 变量——现在不用，将来少写一遍。规格与 `src/lib/print-resume.ts` 的 `PRINT_RESUME_CSS` 保持一致 | `globals.css:284-292` |
| D7 | `AGENTS.md` 要求"动画 `duration-500` 以上"，但代码里有大量 `duration-200/250/300` 的 framer-motion 数值 | 规范只按 class 名书写，工单 08 的验收也只 grep class 名，所以这些数值**从未被纳入范围**。这更像规范与实际意图之间的空白——**建议先明确规范**（是否包含 framer-motion 数值），而不是直接改代码 | `AGENTS.md` 动画规范表；`ui/ConfirmModal.tsx:52,65`、`ui/Toast.tsx:59`、`ResumeCard.tsx:68`、`Navbar.tsx:43` |
| D8 | `ui/Select.tsx:21` 的 `variant` 参数未使用 | **这个不是故意的**——它没有注释说明，是一个无声失效的 prop。列在这里只是为了提醒：不要把它和 D5 那批"有记录的搁置"混在一起处理。见 §5.2 | — |
| D9 | `AIUpload.tsx:117-129` 把简历写进 `sessionStorage` | `:99` 注释说是"Restore saved session on mount"，即**刷新不丢草稿**是明确的产品意图。所以问题**不是**"不该持久化"，而是"持久化了但没有明白告知用户、且与 XSS 风险叠加"——修法是收敛写入频率与加提示，不是删除该功能 | `AIUpload.tsx:99-133` |
| D10 | `docs/adr/` 的 10 条决策（尤其 ADR-0010 的乐观锁、ADR-0009 的镜像列、ADR-0005 的"只报事实不报分数"） | 这些是**已锁定的架构决定**。本报告的发现与它们**不冲突**：H1/H3/H4/H7 都是 ADR 之内的实现缺口，不是对 ADR 的挑战。若某项修复需要偏离 ADR（例如改动 token 存储形态，§1-H9），**必须先写 ADR**，不要静默推翻 | `docs/adr/0000-index.md`；`AGENTS.md` 的领域文档约定 |

---

## 附录 A：建议的工单切分（按 (严重度×可能性)/工作量 排序）

| 序 | 标题 | 落点 | 类型 | 工作量 | 依据 |
|---|---|---|---|---|---|
| 1 | 修 `useResumeAutosave` 的无限渲染循环 + 加引用相等回归用例 | `src/hooks/useResumeAutosave.ts:245/267`、`src/lib/autosave-machine.ts:203-204`、`src/lib/autosave-machine.test.ts` | bug | 小 | §1-H1、§6-T1 |
| 2 | 验证码不再写明文日志 | `internal/biz/user/auth.go:291` | security | 小 | §1-H8 |
| 3 | `resumes(visibility, approval_status)` 索引迁移 | `internal/data/data.go`、`internal/data/migrate/` | perf | 小 | §1-H4 |
| 4 | `list-limit` 不再手抄后端数字 | `src/lib/list-limit.ts:22-26/83` | bug | 小 | §1-H7、§5.3 |
| 5 | 输入/下拉/文本域的错误信息接入 `aria-invalid`/`aria-describedby` | `ui/Input.tsx:114-116`、`ui/Textarea.tsx`、`ui/Select.tsx` | a11y | 小 | §1-H10 |
| 6 | 补齐 8 个 `isIconOnly` 按钮的 `aria-label` + 让删除按钮可聚焦时可见 | `Navbar.tsx:96/106/139`、`ResumeEditor.tsx:753/760/882/909`、`ResumeCard.tsx:79-90` | a11y | 小 | §1-H11、§1-H12 |
| 7 | `@media (prefers-reduced-motion: reduce)` 抑制纯 CSS 动画（17 处） | `src/app/globals.css` | a11y | 小 | §1-H15 |
| 8 | 对话框焦点管理（焦点移入/陷阱/归还 + `ConfirmModal` 补 `role`） | `ui/Modal.tsx:85-98`、`ui/ConfirmModal.tsx:61-104` | a11y | 中 | §1-H13 |
| 9 | `AIUpload` 的 `useState` 副作用改为 effect + 加载态兜底 | `src/components/AIUpload.tsx:136-141` | bug | 小 | §1-H5 |
| 10 | 权限拉取失败不再静默 + 改为合并而非替换 | `src/components/ResumePageClient.tsx:237-249` | bug | 小 | §1-H6 |
| 11 | 站内导航的未保存拦截（补齐 `beforeunload` 之外的情况） | `src/hooks/useResumeAutosave.ts:334-343` | data-loss | 中 | §4.2-D2 |
| 12 | 列表请求失败要能区分"没有数据"与"加载失败" | `DashboardClient.tsx:31-34`、`app/my/page.tsx:45-48`、`AuthContext.tsx:48-51` | ux | 小 | §4.1 |
| 13 | `sse.ts` 加协议级测试 | `src/lib/sse.ts` | test | 小 | §6-T2 |
| 14 | 审批队列批量解析（消除 N+1） | `internal/service/resumevault/approval.go:75-78`、`ai.go:923-926` | perf | 中 | §1-H3 |
| 15 | 无 JS 时简历内容不可见 | `ui/Animations.tsx:109-118`、`ResumeDisplay.tsx:213` | a11y | 小 | §1-H2 |
| 16 | `ui/Tabs` 补 tab 语义 | `ui/Tabs.tsx:51-97` | a11y | 中 | §1-H14 |
| 17 | 前端结构化错误上报（最小可用：`error.tsx` + 一个上报端点） | `src/app/error.tsx`（新建）、后端一个接收端点 | observability | 中 | §7.1 |
| 18 | 后端请求 ID 中间件 + 成功请求访问日志 | `internal/server/http.go:33-52` | observability | 中 | §7.2 |
| 19 | `text-white` → `text-primary-foreground` 等 token（11 处） | 见 §3.2 清单 | design | 小 | §5.4 |
| 20 | `api-client.ts` + `markdown-sanitize.ts` 测试 | 两个 lib | test | 小 | §6-T3、§6-T4 |
| 21 | 清理局部未使用变量与失效 prop（含 `Select.variant`） | 见 §5.2 清单 | chore | 小 | §5.2 |

**排序理由**：1–3 是"能直接造成崩溃 / 凭据泄漏 / 结构性性能退化"且改动都极小；4–10 是"用户能感知的静默失败"且都在一个文件内；11–12 涉及数据与信任；13–18 是让前述问题**变得可发现**的投资；19–21 是清理。

## 附录 B：本报告明确标注为 `unverified` 的项

1. **产物体积**：未运行 `next build`（会破坏正在运行的 dev server 与并发修改者的工作区）。§2.5 的所有体积数字是 `node_modules` **解压**体积，不是打包字节。
2. **`ListPublicApproved` 的执行计划**：缺索引是**静态**事实（模型标签 + 迁移清单），未跑 `EXPLAIN`，未开 GORM SQL 日志。
3. **`GET /api/admin/users` 是否有界**：未读完该 handler。
4. **`ui/Avatar.tsx` 的可访问名**：未读完该文件。
5. **具体色对的对比度比值**：未做计算，未在浏览器中采样。
6. **流式解析期间卡顿的毫秒数**：触发条件明确（逐 token 的 `JSON.stringify` + `write` + `scrollIntoView`），未在浏览器中测量。
7. **焦点环在生产 CSS 下是否可见**：未在浏览器中实测（`outline-none` 与 `focus-within:ring-2` 的交互）。
8. **`gray-matter`/`js-yaml`/`date-fns/locale` 是否真的留在产物中**：客户端可达性已确认（导入图），但无 build 产物可核对。
9. **a11y 测试文件的最新内容**：审计期间被并发修改，§3.4 的状态是 2026-10-14 11:21:41 的快照。
