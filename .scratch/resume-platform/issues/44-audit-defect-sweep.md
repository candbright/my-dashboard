# 44 — 可访问性与错误可见性缺陷清扫

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：—
- **Blocks**：—
- **ADR**：[ADR-0005](../../../docs/adr/0005-ats-report-is-fact-only.md)（仅错误可见性部分相关）、[ADR-0009](../../../docs/adr/0009-grants-authoritative-visibility-derived.md)

## 背景

本工单不来自竞品调研，而来自**只读审计报告** `docs/audit-2026-10-14-readonly.md`（见其附录 A 的排序缺陷清单）。审计在工单 00–22 全部落地之后做了一次全仓复查，发现一批**彼此独立、但都属于同一类**的缺陷：

> 界面把一个"不知道"渲染成了一个"没有"。

这一类在三个层面各有表现，且都不是某个页面写错了，而是**机制本身缺失**：

1. **可访问性**：键盘用户无法完成某些操作，或辅助技术拿不到状态。
   - 模块排序**只能用鼠标拖拽**。
   - 表单错误**只靠颜色**表达。
   - 图标按钮**没有可访问名称**。
   - 对话框**完全不管理焦点**。
2. **错误可见性**：请求失败被渲染成空列表/空状态/"0 条"。
3. **动效**：`prefers-reduced-motion` 全仓 **0 处**使用。

第 3 项（动效）与第 1 项中的一部分（`lang` 属性的更正）在审计报告定稿前后已先行修掉，本工单记录其结论并补上剩余的 1、2 两项。

## 任务

### A. 可访问性

1. **模块排序支持键盘**（`ResumeEditor.tsx`）
   - 拖拽把手可聚焦、有可访问名称、响应方向键（↑/↓/Home/End）
   - 每张卡片另有「上移 / 下移」按钮，名称含模块标题与位置
   - 移动结果通过 `aria-live` 播报（排序是**纯视觉变化**，文字完全相同）
2. **表单错误可被辅助技术感知**（`ui/Input.tsx`、`ui/Textarea.tsx`、`ui/Select.tsx`）
   - `aria-invalid` 表达无效状态（颜色不可作为唯一手段）
   - `aria-describedby` 把错误／说明与字段关联
   - 错误元素 `role="alert"`，出现时即播报
3. **图标按钮全部有可访问名称**
   - `Navbar.tsx`、`ResumeCard.tsx`、`ResumeEditor.tsx` 等所有 `isIconOnly` 站点
4. **`ResumeCard` 删除按钮在聚焦时可见**
   - `opacity-0` **不会**移出 Tab 序列：原先可聚焦但不可见
5. **对话框焦点管理**（新 `src/hooks/useFocusTrap.ts`）
   - 打开时焦点进入对话框、Tab 在内部循环、关闭时归还给触发元素
   - `ConfirmModal` 原先**连 `role` 都没有**；补 `role="alertdialog"` + `aria-labelledby` / `aria-describedby`
   - 背景遮罩 `aria-hidden` + `inert`
   - 危险确认的初始焦点落在**取消**，不是一个回车就能执行删除
6. **`<html lang>` 的更正**（记录性，非改动）
   - 审计一度把 `lang="zh-CN"` 报为违规。**该结论错误**：界面文案是硬编码中文、且没有任何语言切换器，页面主语言确实是中文，`zh-CN` 正确。真实缺口是 **WCAG 3.1.2 Language of Parts**（英文简历**内容**未标注），已升级为独立工作项。

### B. 错误可见性

7. **请求失败不再伪装成"空"**
   - `app/my/page.tsx`：失败曾渲染「还没有简历」——在用户自己的页面上，这句话读起来是**「我的简历被删了」**
   - `components/DashboardClient.tsx`：失败曾渲染「还没有人发布公开简历」——对**别人的数据**做了一个假陈述
   - `app/admin/users/page.tsx`：失败曾渲染 **「0 位用户」**——管理员会读成"用户表被清空了"
   - 三处均：检查 `res.ok`、显示真实原因、提供**重试**；且失败时**不清空已有列表**（刷新失败不该销毁屏幕上还有的内容）
8. **权限拉取失败不再静默降级**（`ResumePageClient.tsx`）
   - 原先 `.catch(() => {})` 让编辑按钮**无声消失**，用户无从知道原因、也无处可点
   - 现在说明原因并提供重试；**不**授予服务器未下发的任何权限（ADR-0009 仍是唯一真相源）
9. **会话不再被瞬时网络故障终结**（`AuthContext.tsx`）
   - 原先任何异常都 `clearToken()`；而 `apiFetch` 只在传输失败时 reject，401 是**正常 resolve** 的响应
   - 现在只有 401/403 才结束会话；5xx 与网络故障保留 token（token 无状态，真失效时下一次调用自然会 401）

## 验收标准

- [x] 模块排序可仅用键盘完成，且有播报
- [x] 表单错误通过 `aria-invalid` + `aria-describedby` 关联，且 `role="alert"`
- [x] 全仓无未命名的 `isIconOnly` 按钮
- [x] 删除按钮聚焦时可见
- [x] 对话框打开时焦点进入、Tab 受限、关闭时归还；`ConfirmModal` 有对话框语义且初始焦点在取消
- [x] 列表加载失败显示原因与重试，不渲染空状态
- [x] 权限拉取失败可见且可重试，不静默降级
- [x] 401/403 之外的失败不再登出
- [x] `npx tsc --noEmit` exit 0
- [x] `npm run test` exit 0
- [x] `npx eslint .` 不高于基线
- [x] `npm run build` exit 0

## 备注

- 两项**未做**，原因是它们不是"实现"而是**产品/法务决策**，见下方「遗留」。
- 审计报告 §6 的两个决策仍待定：ADR-0005 与公开 ATS 评分器的关系、AI 标识的法律定性。

## Comments

### 实现结果（2026-10-16）

> 本次改动**尚未提交**（工作区仍为脏）。所有数字为本次运行实测。

#### 1. 模块排序：把"拖拽"从唯一手段降为其中一种（`src/components/ResumeEditor.tsx`）

`Reorder.Item` 设了 `dragListener={false}`，所以把手是启动拖拽的**唯一**入口；而把手是个裸 `<div>`，只有 `onPointerDown`。读依赖源码确认 framer-motion 的 `Reorder.Item` 本身**不提供**键盘支持（`node_modules/framer-motion/dist/es/components/Reorder/Item.mjs` 只接 `drag`/`onDrag`/`onDragEnd`/`onLayoutMeasure`）。后果是键盘用户**完全无法**排序——WCAG 2.2 **2.1.1**（A）与 **2.5.7**（AA，该条款正是为"只能拖拽"而写）。

新增 `moveSection(sectionId, 'up' | 'down' | 'first' | 'last')`，放在 `removeSection` 旁边，理由相同：**结构性编辑**，所以先 `flush()`，随后立即导航不会丢字。排序在数组上做，键盘路径与拖拽路径因此不可能对"顺序"有两套理解。

把手现在 `role="button"` + `tabIndex={0}` + `aria-label` + 方向键处理（↑/↓/Home/End）；每张卡片另有「上移 / 下移」按钮，`aria-label` 含标题与「第 N / M 项」，端点处 `disabled`，让边界**可见**而不是静默无效。移动结果写入一个 `aria-live="polite"` 区域——**排序是纯视觉变化**，文字一字未改、只是位置变了，没有播报就等于没有任何反馈。

`status` 与 `aria-live="polite"`（而非 `assertive`）是刻意的：用户是主动发起的移动，不需要打断当前朗读，但需要知道落点。

#### 2. 表单错误：颜色不能是唯一手段（`ui/Input.tsx`、`ui/Textarea.tsx`、`ui/Select.tsx`）

三者的错误消息原本都是紧挨字段的一个裸 `<p>`，且**从不**设置 `aria-invalid`。全仓 `aria-invalid` / `aria-describedby` 命中数均为 **0**。于是错误只通过**红色边框 + 红字**表达，屏幕阅读器用户听到的是一个普通字段，消息成了表单里一段无归属的文字。WCAG **3.3.1**（A）、**1.3.1**（A）、色彩单独一项 **1.4.1**（A）。

现在：`aria-invalid` 表达状态；`aria-describedby` 指向错误（有错时）或说明（无错时）；错误元素 `role="alert"`。id 由 `id` 派生（`${id}-error` / `${id}-description`），所以调用方自带 `id` 时关联依然成立。

**在原子层测试**是刻意的：全站表单都由这三个组件搭成，在这里断言一次即覆盖所有调用点；逐页测会在每个新表单上重复，而"忘了写"正是这个缺口当初形成的方式。

#### 3. 图标按钮的可访问名称

审计称 11 个 `isIconOnly` 站点中 8 个缺名称。实测（脚本扫描全部非测试 `.tsx`）修完为**全仓 0 处缺失**。补名清单：

| 文件 | 控件 |
|---|---|
| `Navbar.tsx` | 账号设置、退出登录、移动端菜单开关（另补 `aria-expanded` + `aria-controls`，并给菜单面板加 `id`） |
| `ResumeCard.tsx` | 删除（名称含简历标题） |
| `ResumeEditor.tsx` | 展开/收起（含 `aria-expanded`）、删除模块、删除经历、删除描述 |

`Button.tsx` 自身的 `isIconOnly` 命中是**类型定义**，不是实例。

#### 4. 聚焦时才现身 = 键盘用户的空操作（`ResumeCard.tsx`）

删除按钮 `opacity-0 group-hover:opacity-100`：`opacity-0` **不会**把元素移出 Tab 序列，所以键盘用户会**聚焦到一个看不见的按钮**上（WCAG **2.4.7**，AA）。补 `group-focus-within:opacity-100` 与 `focus-visible:opacity-100`，并按 4.1.2 补名称。

#### 5. 对话框焦点：整套机制原先不存在（新 `src/hooks/useFocusTrap.ts`）

`Modal` 与 `ConfirmModal` 都**不移动焦点**；全仓从未调用过 `.focus()`、`autoFocus` 或 `inert`。`role="dialog"` 只是**描述**，浏览器不会因此改变焦点：焦点留在遮罩**后面**的触发元素上，Tab 会走出对话框进入下层页面。

hook 做三件事：打开时把焦点移入（优先 `[data-autofocus]`，否则第一个可聚焦元素，再否则面板本身）、Tab/Shift+Tab 在面板内循环、关闭时归还给**原触发元素**（存下来而不是让调用方指定，于是每个对话框都自动正确）。遮罩上加 `aria-hidden` + `inert`。

`ConfirmModal` 另补：`role="alertdialog"` + `aria-labelledby` / `aria-describedby`（原先**连 `role` 都没有**，标题和按钮被当作普通页面内容朗读）、背景滚动锁（与 `Modal` 对齐）、以及**初始焦点落在「取消」**——一次误触回车不该执行破坏性操作。

**一个被测试抓出来的真实实现缺陷**：`focusableWithin` 最初用 `offsetParent !== null` 判断可见性。happy-dom 对**所有**元素都返回 `null`（它没有布局引擎），于是候选集为空、焦点陷阱**静默失效**。改为优先用 `checkVisibility()`，`offsetParent` 仅作降级——顺带避免了 `offsetParent` 对 `position: fixed` 元素的经典误判。**这是测试抓到的，不是代码审阅抓到的。**

#### 6. `<html lang>`：更正一个**错误**的审计结论，而不是"修"它

三份文档互相矛盾（`constraints-research.md` 说违规，`audit-2026-10-14-readonly.md:404` 说正确）。以证据定论：界面字符串**硬编码中文**（`Navbar.tsx` 首页/我的/创建/管理），且语言切换器命中数为 **0**（`setLanguage`/`i18n`/`useLocale`）。`<html lang>` 声明的是**页面主语言**，而它确实是中文 → `zh-CN` **正确，未改动**。

真实缺口是 **WCAG 3.1.2 Language of Parts**：英文简历**内容**未标注语言（非 `<html>` 元素上的 `lang` 命中数为 0）。已从"一行就能修"重新归类为**独立工作项**（报告 §7 的 B1.5）。

#### 7. 错误可见性：把"不知道"渲染成"没有"

三处的 `.catch` 把 `resumes` 清空，于是失败与"真的为空"在界面上**完全一致**：

| 位置 | 失败时曾显示 | 为什么这句话有害 |
|---|---|---|
| `app/my/page.tsx` | 「还没有简历」 | 在**自己的**页面上读作**「我的简历被删了」**，下一步是恐慌或重传 |
| `components/DashboardClient.tsx` | 「还没有人发布公开简历」 | 对**别人的数据**做了假陈述，而这正是用户来查的事 |
| `app/admin/users/page.tsx` | **「0 位用户」** | 管理员读作"用户表被清空"，且标题就写着条数 |

三处统一为：检查 `res.ok`（非 2xx 原先被当成列表解析）、显示**真实原因**、给出**重试**；失败时**不清空**已有列表（刷新失败不该销毁屏幕上还有的内容）；错误分支排在空状态**之前**，所以假空状态不可能被渲染。

`admin/users` 的时间判定：`if (loadError)` 提前 `return`，因此那句危险的「0 位用户」在任何失败下都不会出现。

#### 8. 权限失败：静默降级比报错更糟（`ResumePageClient.tsx`）

`apiFetch(...).then((res) => (res.ok ? res.json() : null)).catch(() => {})`：非 2xx 与网络失败都塌缩成 `null`，而结果只是"编辑按钮不出现"。一个**已登录的 owner** 看到只读页面、**没有任何原因**，且**无处可点**——从用户视角这与"我失去了自己简历的权限"无法区分。

现在：非 2xx 抛错、失败置 `permissionsFailed`、渲染一条说明"这不代表你没有权限，可以重试"并带重试按钮的提示。**它只报告问题，不授予任何服务器未下发的权限**——`can_edit` 仍只来自 `permissions`（ADR-0009）。

#### 9. 会话不被瞬时故障终结（`AuthContext.tsx`）

`refresh` 的 `catch` 无条件 `clearToken()`。但 `apiFetch` **只在传输失败时 reject**，401 是**正常 resolve** 的响应，`res.json()` 之后 `data.user` 为空——两者被同样处理。于是一次网络抖动 = 静默登出，且没有任何解释。

现在只有 **401/403** 才结束会话；5xx 与网络故障保留 token（"未知"不等于"无效"）。保留的开销为零：token 无状态，若真失效，下一次 API 调用返回 401，`apiFetch` 照样把用户送去登录页。

#### 10. 一个**假阳性**的排查结论（记录以免后人重查）

脚本初扫时，`admin/ai/page.tsx`、`settings/ai/page.tsx`、`ProviderFormModal.tsx` 的 `setCatalog([])` / `setDiscovered([])` 看起来像同类缺陷。**逐一读过后确认是假阳性**：它们是**成功路径**上主动作废缓存的（注释写明"catalogue 的 already-added 标记已过期"），不是错误处理。`ResumeHistoryPanel.tsx` 的 `setPreview(null)` 也在 `.catch` 里，但它同时设置了 `previewError`，属于**正确**写法，未改。

**真正的 catch 清空状态点经复核只有上述三处**（`my/page`、`DashboardClient`、`admin/users`）。

#### 11. 由测试抓出、而非审阅抓出的一处 lint 回归（无新增告警）

为"重试"加状态时，最初把 `setLoadingResumes(true)` 与 `setLoadError(null)` 写在 effect 体内，触发 `react-hooks/set-state-in-effect`（该规则**直接读 effect 体的指令**，见插件源码 `eslint-plugin-react-hooks` 中 `EffectSetState` 分支）。正确处理不是压制规则，而是把写入**移回它真正的起因**——重试按钮的点击。`loadingResumes` 本就初始化为 `true`，挂载时的写入本身也是多余的。

### 验收命令结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0，无输出 |
| `npm run test` | **28 passed + 1 skipped（29 文件）**，**768 passed + 3 expected fail + 1 skipped（772）**，exit 0 |
| `npx eslint .` | **23 problems（13 errors / 10 warnings）**，**低于**基线 24 |
| `npm run build` | `✓ Compiled successfully`；TypeScript 13.2s；14 个路由（12 静态 / 2 动态），exit 0 |

### 新增测试

| 文件 | 数量 | 钉住什么 |
|---|---|---|
| `src/components/ResumeEditor.a11y.test.tsx` | 8 | 把手可聚焦且有名称、存在非拖拽的移动手段、移动有 `aria-live` 播报、framer 的 `Reorder.Item` 确实无键盘支持；**并且真的点击按钮断言顺序发生交换**、播报内容含新位置、端点按钮为 `disabled` |
| `src/components/ui/form-error-a11y.test.tsx` | 6 | 三个原子的 `aria-invalid` / `aria-describedby` / `role="alert"`；**无错误时不得声称无效**；未传 `id` 时关联仍成立 |
| `src/components/ui/dialog-focus.test.tsx` | 6 | 焦点进入对话框、**不停留在遮罩后的触发元素上**、关闭时归还、`ConfirmModal` 的对话框语义与名称、**初始焦点在取消而非确认** |
| `src/lib/http-json.test.ts` | 11 | 非 2xx 一律是失败而非数据、透出服务端 `error`、无 `error` 时回退文案含状态码、**错误体不是 JSON 也不得抛出**、`error` 非字符串不得渲染成 `[object Object]`、**2xx 但正文不可解析也算失败**、3xx 不算成功；以及 `isAuthFailure` 只认 401/403，5xx/408/429/404 都不算过期 |
| `invariants/design-system.test.ts`（先前） | 7 | 设计系统规范（整树不变量，位于 `invariants/` 第二个 vitest root） |

### 一处刻意的抽取：`src/lib/http-json.ts`（12. 补记）

第 7 节的错误处理最初写成三份**内联**的相同逻辑，那样它只能靠人读代码来保证正确。现抽成 `readJsonBody(res, fallback)`，返回判别联合 `{ ok: true, data } | { ok: false, error }`，三处调用点改用它；`isAuthFailure` 同时成为**全应用唯一定义"会话过期"的地方**（`AuthContext` 也改用它）。

选判别联合而不是抛异常，是因为调用方需要区分**三种**结果——成功、值得展示给用户的错误、以及 2xx 但正文坏掉——而抛异常会把后两者合并，恰好抵消这次修复的意义。它同时让 `ok: false` **必须**被显式处理，于是"失败时留空"不可能再被顺手写回来。

**测试覆盖到哪、没覆盖到哪（务必分清）**：`readJsonBody` 与 `isAuthFailure` 有 11 个用例；而 `app/my/page.tsx`、`DashboardClient.tsx`、`admin/users/page.tsx`、`AuthContext.tsx` 四个**调用点本身仍无组件测试**（它们依赖 `AuthGuard`/`useAuth`，为它们搭测试骨架的收益不抵成本）。也就是说：**判定逻辑被钉住了，接线没有**。接线错误仍只能靠人读。

**`ResumeEditor.a11y.test.tsx` 的两个用例原先以 `it.fails` 承载**（按 AGENTS.md：已确认但未修的缺陷必须**可复现**）。修好后这两个用例如期转红——那正是"该改成普通 `it`"的信号——现已改为普通 `it` 并通过，同时在文件头记录了完整来龙去脉。**当前全仓 `it.fails` 存量：`resume-parser.test.ts` 3 处**（工单 17 的 YAML 转义，仍未修）。

**这组测试做过变异验证**（因为"按钮存在且有名称"对**一个什么都不做的按钮**同样成立）：把 `moveSection` 临时改成恒定 `return null` 后，**恰好 2 个用例转红**（顺序交换与播报），恢复后转绿。也就是说行为断言确实对"静默无效的实现"敏感，而不是只在数元素。

### 遗留（未做，且建议不要直接做）

- **环境更正（影响可复现性，值得记住）**：本机 `127.0.0.1:5432` 上**确实有** PostgreSQL 16.11 在服务——它跑在 **WSL 里**，不是部署栈的容器（`deploy/docker-compose.yml` 里 postgres 不发布任何宿主端口），也不是 Windows 服务 `postgresql-x64-18`（该服务显示 Stopped，且进程列表里没有任何 `postgres`）。判定依据与可用的 DSN 已写入 `DEPLOY.md` §9.1。因此 `kratos-server` 的连库测试在本机**是真的在跑**（585 PASS / 0 SKIP），也正是这一点让 v5 漏掉的 `NoTransaction: true` 被真实库集成测试抓了出来。**代价**：这组测试依赖本机环境，不适合当无依赖 CI 门禁。

- **两个决策仍待定**（审计报告 §6），它们不是实现问题：
  1. **ADR-0005 与公开 ATS 评分器**：ADR-0005 边界 #3 在三个条件下**允许**数字评分，而「后果」明写"不合成单一分数"。两者张力真实存在，需人裁决，不宜由 agent 单方面解释。
  2. **AI 标识的法律定性**：`模拟自然人` 是否覆盖 AI 辅助写简历，建议法务判断。可立即动手的工程检查是：**AI 网关是否记录了含姓名/电话的 prompt**。
- **观测能力为零**（本工单未修，但它是上面这类缺陷"只能靠用户投诉发现"的原因）：前端无 `error.tsx`/`global-error.tsx`/`not-found.tsx`、无 Sentry、无 `window.onerror`、无 `unhandledrejection`、无 `reportError`、无 `web-vitals`；后端只记失败请求（`internal/server/http.go` 的 `errorEncoder`），无请求 ID、无 tracing、无 metrics。**渲染死循环当初只在用户自己的浏览器里可见**，成功请求的延迟无法测量。
- **先前遗留、本工单未触碰**：打印路径绕过 `ResumeMarkdown`（`**粗体**`／`[链接](url)` 会**原样**进 PDF）；`ResumeSplitEditor.tsx` 的 `markdown`/`onParsedChange` 解构后从未使用；`ui/Select.tsx:21` 的 `variant` 赋值后从未使用（静默死 prop）；`useResumeAutosave.ts` 只注册 `beforeunload`，**应用内导航仍会丢编辑**。
