# 12 — `version` 列 + 乐观锁

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：11（迁移器）
- **Blocks**：14（自动保存）、16（版本历史）、19（展示态，共用 version）
- **ADR**：[ADR-0010](../../../docs/adr/0010-content-versioning-and-optimistic-locking.md)

## 背景

`resumes` 表**没有 `version` / `etag` 列**，`PUT /api/resumes/{id}` 是**后写覆盖**。

而计划引入**自动保存**（行业门槛功能）。自动保存让请求变得频繁且并发：

- 两个标签页同时打开同一份简历 → 交替覆盖
- 自动保存与用户主动保存竞争
- 网络重试导致重复提交

**在没有并发控制的表上开启自动保存，等于主动制造数据丢失。**

## 任务

### 1. 加列（第一条真实迁移）

- `resumes.version` 整数，**默认值 1**，`NOT NULL`
- 走工单 11 的迁移器：**加列 → 回填为 1 → 设 `NOT NULL`**
  > 这正是 `AutoMigrate` 做不到的组合（它会对非空表直接发 `ALTER TABLE … NOT NULL` 而不回填 → 启动失败）

⚠️ **加列需改四处**（后端约定）：`ResumeModel`、`Resume` 领域结构体、`toResumeDomain`、`toResumeModel`

### 2. 乐观锁语义

- `UpdateResumeRequest` 增加 `version` 字段（**proto 变更 → 需 `make api` 重新生成**）
- 保存时比对：不匹配 → **HTTP 409 Conflict**，响应含当前版本与最后修改时间
- **展示态更新共用同一个 `version`**（ADR-0004）——内容更新与样式更新互相不能覆盖

### 3. 顺带修复一个既有缺陷

后端 `UpdateResume` 的 `visibility` 与 `markdown` **在同一请求里互斥**——`visibility` 分支提前 `return`，**静默忽略同请求里的 `markdown`**。改动此接口时一并处理：要么分离为两个端点，要么返回明确错误而非静默忽略。

### 4. 前端适配

- `src/lib/api-client.ts`、`ResumeEditor.tsx`、`ResumePageClient.tsx` 传递并维护 `version`
- 收到 409 → **提示用户**，明确告知"服务端有更新版本"，让用户选择（**不做自动合并**，ADR-0010）

## 验收标准

- [ ] 迁移可重放；迁移后所有存量行 `version = 1`
- [ ] 版本不匹配 → 409，响应含当前版本
- [ ] 版本匹配 → 保存成功且 `version` 自增
- [ ] 两标签页并发编辑 → **产生 409 而非静默覆盖**
- [ ] 展示态与内容共用 version（工单 19 依赖此点）
- [ ] `visibility` + `markdown` 同请求不再是静默忽略
- [ ] 前端在 409 时给出中文提示且不丢用户输入
- [ ] 后端测试覆盖乐观锁的成功与冲突两条路径

## 备注

- ⚠️ **这是破坏性 API 变更**：旧客户端不带 `version` 会被 409 拒绝。需在 `DEPLOY.md` 说明，并考虑对缺失 `version` 的请求给一个过渡期策略（如"缺失则视为强制覆盖"并记录警告）——**但过渡期必须有明确结束条件**。
- `version` 与展示态共用是本工单的**关键设计点**，不要为展示态单独开一个版本列。

## Comments

### 实施结果（已完成）

`version` 列 + 乐观锁已落地，**后端 + 前端 + 文档**三部分都完成。工单自身的**备注**里建议的过渡期策略（"缺失则视为强制覆盖"并记录警告）**没有采用**，理由见下。

#### 验收标准逐条核对

| 验收标准 | 结果 | 证据 |
|---|---|---|
| 迁移可重放；迁移后所有存量行 `version = 1` | ✅ | 空库首启 → `schema_migrations` 记录 `0 baseline_automigrate` + `1 add_resume_version_column`，列形态 `version \| NO \| 1`；再对**已存在 3 行的表**删列并删记录后重启 → 只重放迁移 1，3 行全部回填为 1，重启不再重复执行 |
| 版本不匹配 → 409，响应含当前版本 | ✅ | `HTTP 409`，`reason=VERSION_MISMATCH`，`metadata.current_version="3"`、`last_modified_at="2026-10-13T10:56:19+08:00"` |
| 版本匹配 → 保存成功且 `version` 自增 | ✅ | `HTTP 200`，响应 `version=2`，库内 `version=2` |
| 两标签页并发 → 409 而非静默覆盖 | ✅ | 甲 `200`（→3）、乙 `409`；磁盘上是甲的内容，**乙的内容未落盘**，库内 version 停在 3 |
| 展示态与内容共用 version | ✅ | 同请求带 `markdown` + `visibility` → `version` 3→5（内容一次、可见性一次），无独立版本列 |
| `visibility` + `markdown` 同请求不再是静默忽略 | ✅ | 同请求两者的响应与磁盘内容都生效（原先 `visibility` 分支提前 `return` 丢弃 `markdown`） |
| 前端在 409 时给出中文提示且不丢用户输入 | ✅ | `src/components/ConflictNotice.tsx` 常驻提示（不是 toast），含当前版本与最后修改时间，提供"载入最新内容（保留我的修改）"；明确**不提供**丢弃草稿的按钮 |
| 后端测试覆盖乐观锁的成功与冲突两条路径 | ✅ | `resume_version_test.go` 19 个用例，含 `TestSaveWithTheCurrentVersionSucceeds` / `TestStaleVersionIsRefused` / `TestConcurrentTabsProduceAConflictNotASilentOverwrite` / `TestMissingVersionIsRefused` |

另外 10/10 的实机验收（见 `DEPLOY.md` §8.1 的表格）全部通过。

#### 实施中发现并修复的 4 个真实缺陷

1. **锁有一扇后门（最严重）**。`Update` 原本写成 `if expectedVersion > 0 { query = query.Where("version = ?", ...) }`——**不带 `version` 的请求会整条跳过校验并写穿，返回 200**。实机测试抓到（不是审阅抓到的）。修法：去掉条件分支，`expectedVersion <= 0` 直接按冲突拒绝；删除 `UpdateUnversioned`；内部写入方改为 `SetVisibility` / `SetApprovalDecision` 两个单语句方法。回归测试：`TestMissingVersionIsRefused`。

2. **`toProtoResumeInfo` 从不设置 `Version`**。于是前端**永远拿不到 token**，任何一次保存都会被拒。这个缺陷和上一条组合起来会形成"看起来能用"的假象——旧前端不带版本号，服务端放行。补上 `Version: r.Version` 后实机确认 `GET` 与 `PUT` 响应都带版本号。

3. **错误编码器丢掉 `reason` 与 `metadata`**。`internal/server/http.go` 的 `errorEncoder` 只回 `{"error": ...}`，于是 409 里**机器可读的当前版本被静默丢弃**。前端只能去正则匹配中文，文案一改就坏。已让编码器带上 `reason` 与（非空时）`metadata`，`error` 字段语义不变，普通错误响应体保持逐字节一致。

4. **`updated_at` 从未写入**。`toResumeModel` 会把域对象的 `CreatedAt`/`UpdatedAt` 原样拷到 model 上，零值因此被当作显式值写进 INSERT，GORM 的 `autoCreateTime` 没有机会生效 → 新简历 `updated_at IS NULL`。而 `updated_at` 正是冲突提示里的"最后修改时间"，结果是提示用户"最后修改于 0001-01-01"。修法：`SaveResume` 里自己打时间戳；同时把未知时间**统一规范为零值**，`conflictMessage` 与 `last_modified_at` 在零值时**省略时间**而不是编一个。前端 `formatLastModified` 也把年份 < 1000 视为未知。测试：`TestCreatedResumeRecordsItsTimestamps`、`TestConflictLeavesAnUnknownModificationTimeUnknown`。

#### 一个我自己犯的测量错误（记录以免重蹈）

中途我一度认为"一次用户操作让版本涨了两次"，并据此做了单语句重构。开启 GORM SQL 日志后发现：带 `markdown` + `visibility` 的请求**本来就该发 2 条 UPDATE**（内容、可见性各一条），只带内容的请求**恰好 1 条**。数字偏大是我自己早先的一次 `SetVisibility` 写入叠加了过期的库基线。单语句重构本身是对的（更简单、语义更清楚），予以保留，但把 4 处声称"客户端落后三个 token"的注释改成了诚实的说法。

#### 关键设计决定（后续工单请沿用）

- **`version` 是 proto3 普通标量，线上无法区分"字段缺失"与"值为 0"**。因此不存在"只对旧客户端放行"的写法——任何"允许 0"的实现，绕过方式就是**不发这个字段**（缺陷 1 就是这么发生的）。所以本工单采取的策略是：**旧客户端得到明确的、可处理的 409（`VERSION_MISSING`），而不是一个静默覆盖窗口。** 工单备注里建议的"缺失则视为强制覆盖"被**否决**，因为它等于把缺陷 1 重新引入，只是加了一行日志。
- **0 只有一个含义**："客户端没发 / 无法校验" → 拒绝。任何写入方都不得用 0 绕过锁。
- **两种 reason 分开**。`VERSION_MISMATCH` = 别人先保存了；`VERSION_MISSING` = 没人动过，只是本次请求没带版本号。对后者说"已在别处被修改"会把用户引去寻找一个不存在的同事，并让他不再信任下一次真正的冲突。
- **过渡期有明确结束条件**（本工单备注的硬要求）：后端已迁移到版本 ≥ 1、前端已部署到读回 `version` 的版本、且后端日志连续 **7 天**无 `reason=VERSION_MISSING`。三条全满足后即可删除 `DEPLOY.md` §8.1。第 3 条是真正的判据。
- **部署顺序必须先后端后前端**。迁移对非空表是安全的（加可空列 → 回填 → 加约束），因为走的是工单 11 的迁移器；`AutoMigrate` 做不到这个组合。两步之间旧前端保存会 409，故间隔应尽量短。
- **必须带版本号的请求也会退版本吗？不会。** 一次写入一个版本号：内容 1 次、可见性 1 次，`.md` 文件在冲突时**不会被写**（先在内存里比对版本，再写文件）。

#### 文件清单

**后端（`D:\project-me\kratos-server`）**
- `api/resumevault/v1/resume.proto` — `UpdateResumeRequest.version = 4`、`ResumeInfo.version = 23`；**只用 protoc 单独重新生成 `resume.proto`**，不要跑 `make api`（会让所有 proto 文件产生无意义变动）
- `api/resumevault/v1/admin_ext.go` — **已删除**：它手写的 `UpdateUserAIEnabledRequest`/`Reply` 与 protoc 新生成的类型重复；protojson 同时接受 `userId` 与 `user_id`，前端不受影响
- `internal/data/data.go` — `migrations` 注册表 + `addResumeVersionColumn`（3 步幂等，同一事务）
- `internal/data/resumevault/model.go`、`data.go` — `Version` 字段与两个转换函数
- `internal/data/resumevault/resume.go` — `writableColumns`/`updatesMap`、`Update`（无条件 `WHERE version = ?` + `SET version = version + 1`，`RowsAffected == 0` → 冲突，随后重读）、`SetVisibility`、`SetApprovalDecision`；并注明**为什么不存在通用无锁写入方法**
- `internal/biz/resumevault/resume.go` — `Resume.Version`、`StaleVersionError`（含 `errors.Is` 支持）、`UpdateResumeContent`（**写文件前**先校验版本）、状态常量、`lastModifiedOrZero`
- `internal/biz/resumevault/resume_approval.go` — 改走 `SetVisibility` / `SetApprovalDecision`
- `internal/service/resumevault/resume.go` — `UpdateResume` 重写（鉴权 → 取行 → 归属校验 → 两字段都校验版本 → 先内容后可见性 → 重读）、`conflictMessage`、`asHTTPError`（409 + metadata）、`toProtoResumeInfo` 补 `Version`
- `internal/server/http.go` — `errorEncoder` 带上 `reason` / `metadata`
- 测试：`internal/biz/resumevault/resume_version_test.go`（19 例）、`resume_list_limit_test.go` 的 `fakeResumeRepo` 同步更新

**前端（`D:\project-me\my-dashboard`）**
- `src/lib/types.ts` — `ResumeRecord.version?: number`
- `src/lib/version-conflict.ts`（新）+ `.test.ts`（30 例）
- `src/lib/resume-api.ts`（新）+ `.test.ts`（18 例）— `saveResume` / `fetchResumeDetail` / `ResumeConflictError`
- `src/components/ConflictNotice.tsx`（新）
- `src/components/ResumePageClient.tsx` — 两个 PUT 调用点都带上版本；409 时保留草稿并渲染常驻提示
- `src/components/ResumeEditor.tsx` — 明确 `onSave` 契约（"自己报错、不要抛"），否则保存失败会变成无人处理的 promise rejection，用户什么都看不到

**文档**
- `DEPLOY.md` §8.1 — 破坏性变更、响应格式、部署顺序、**过渡期结束条件**

#### 验证命令

- 后端：`go build ./...` / `go vet ./internal/... ./api/...` / `go test ./internal/... -count=1` → 全部 exit 0；23 个改动 `.go` 文件 gofmt 干净、无 BOM
- 前端：`npm run build` / `npm run test` → exit 0；**333 passed, 9 expected fail**；eslint 与既存基线一致（改动的 6 个文件零告警）

#### 遗留

- `resume_vault`（生产库）**仍未迁移**，PID 26524 跑的还是旧二进制。迁移会在部署新二进制时自动执行。
- ADR-0006 已记录：迁移器**没有 Postgres advisory lock**，仅支持单实例；横向扩容前必须补上。
- 展示态的 JSONB 本体是工单 19 的范围；本工单只保证**它和内容共用同一个 `version`**，这一点已由"同请求两者都写入、版本各进一位"验证。

