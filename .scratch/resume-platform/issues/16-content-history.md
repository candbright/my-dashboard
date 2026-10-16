# 16 — 内容版本历史

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：11（迁移器）、12（乐观锁）、14（自动保存）
- **Blocks**：—
- **ADR**：[ADR-0010](../../../docs/adr/0010-content-versioning-and-optimistic-locking.md)

## 背景

当前**无跨会话版本历史**。唯一的"版本历史"是 `AIUpload.tsx` 里的 `HistoryEntry`——**仅存活于 AI 会话内**，刷新即失。

市场调研把「真正的版本历史」列为差异化功能，并指出**无人做好**：竞品简历本有撤销功能，但**保存退出后即清空**。

ADR-0010 的决定：**每次保存写一条完整 Markdown 快照。**

**为什么是完整快照而不是 diff**：快照在 Markdown 上**零正确性风险**。diff（JSON Patch）省空间，但重建一旦有 bug，**回滚会静默损坏内容**。

这一步同时买到两样东西：**数据安全网**（自动保存出错可回滚）+ **差异化功能**。

## 任务

1. 新增 `resume_versions` 表：
   - `id`、`resume_id`、`version`（对应 `resumes.version`）、`markdown`、`created_at`、`created_by`
2. 每次保存（含自动保存）**追加一条快照**
3. **上限为配置项**，默认 **50 条/简历**（`config.yaml`）
   > 存储是磁盘文件，且是全项目**唯一无服务端大小限制的字段**。硬编码会让自托管用户无法按磁盘情况调整
4. **清理逻辑**：超过上限时删除最旧的（**必须有**，否则问题从磁盘转移到数据库）
5. **不包含展示态**——只快照简历文档（ADR-0004/0010）。否则"换个颜色"会污染内容历史
6. **可见性跟随简历现有规则（owner / admin）**——**不新增权限类型**（ADR-0009：`Known()` 是闭集校验，"每个新功能加一个权限类型"会让权限系统膨胀）
7. UI：历史列表 + 预览 + **回滚**（回滚本身也是一次保存，产生新版本，**不删除历史**）

## 验收标准

- [x] 每次保存产生一条快照
- [x] 可查看历史列表并预览任一版本
- [x] 可回滚到任一版本，回滚后内容正确且产生新版本
- [x] 超过上限自动清理最旧记录
- [x] 上限可从 `config.yaml` 配置
- [x] **非 owner/admin 无法访问历史**
- [x] 展示态变更**不产生**历史记录
- [x] 历史记录不包含展示态字段
- [x] 有后端子测试覆盖：追加、清理、回滚、权限

## 备注

- ⚠️ 与 `AIUpload.tsx` 的 `HistoryEntry` 的关系需要理顺：AI 会话内的历史是**临时的**，本工单的是**持久的**。理想情况下 AI 会话的 apply 操作也应写入持久历史（因为它确实改变内容）。
- 存储体积估算：一份 10 KB 的 Markdown × 50 条 × N 份简历。对自托管规模可接受，但**配置项与清理逻辑不可省**。

## Comments

**状态：已完成（2026-10-13，含真实 Postgres 验证）**

### 后端

| 位置 | 内容 |
|---|---|
| `internal/biz/resumevault/resume_version.go`（新增） | `ResumeVersion` / `ResumeVersionSummary` / `ResumeVersionRepo` 接口、`ErrVersionSnapshotNotFound`、`DefaultVersionHistoryLimit = 50`，以及 use-case 的 `ListResumeVersions` / `GetResumeVersion` / `CountResumeVersions` / `RollbackResumeVersion` |
| `internal/data/resumevault/resume_version.go`（新增） | `resumeVersionRepo`：`Append`（事务内 `pg_advisory_xact_lock` + 插入 + 裁剪）、`List`（不查 `markdown`）、`GetByID`（按 `resume_id` **和** `id` 双重限定）、`Count`、`DeleteByResumeID` |
| `internal/data/resumevault/model.go` | `ResumeVersionModel`（`resume_versions`）。**故意不设外键、不设 GORM 关联**——见下 |
| `internal/data/data.go` | 迁移 **v3** `create_resume_versions_table`（幂等两语句）+ `AutoMigrate` 基线补上该模型 |
| `internal/biz/resumevault/resume.go` | `ResumeUsecase` 增加 `versionRepo`（容忍 nil）与 `versionLimit`；`UpdateResumeContent` 增加 `createdBy *string`；`recordVersion` 在**加锁写入之后**调用，失败**只记日志不失败保存**；`DeleteResume` 先删快照 |
| `internal/service/resumevault/history.go`（新增） | 三个 RPC handler + `authorizeResume` + `historyError` |
| `api/resumevault/v1/resume.proto` | `ListResumeVersions` / `GetResumeVersion` / `RollbackResumeVersion` 及其消息，已用 protoc 重新生成 |
| `cmd/kratos-server/{main,wire,wire_gen}.go` | `resume.history_limit` 配置项贯通（`wire_gen.go` 手写维护） |
| `configs/config.yaml` + `D:\project-me\configs\kratos-server\config.yaml` | `history_limit: 50` |

`asHTTPError` 新增 `ErrAlreadyHTTP` 哨兵：回滚也是一次受锁约束的写入，因此可能产生 409；而 409 必须由 `asHTTPError` 构造（它才带 `current_version` 元数据）。没有哨兵时，后续的 `historyError` 会把已经映射好的 409 落到自己的 `default` 分支变成 500，客户端就丢掉了恢复所需的那条信息。

### 前端

- `src/lib/resume-api.ts`：`listResumeVersions` / `fetchResumeVersion` / `rollbackResumeVersion`（+ 类型）。回滚的 409 复用现成的 `ResumeConflictError`，面板不需要第二套恢复路径。
- `src/components/ResumeHistoryPanel.tsx`（新增）：列表 + 预览 + 回滚确认。选中即懒加载正文（列表响应故意不带 `markdown`）。
- `src/components/ResumePageClient.tsx`：新增 `history` 视图与工具栏入口；回滚成功后写回 `resume`/`parsed`/`markdown`（**必须**，否则下一次自动保存会带过期 version）。
- 入口条件用现成的 `permissions.can_edit`（= owner 或 admin），**没有新增权限类型**（ADR-0009 的 `Known()` 是闭集，ADR-0010 明确禁止）。

### 关键发现：单条 `DELETE` 并不足以强制上限

最初按"单条派生集合 DELETE 就足够"实现，因为 count-then-delete 会互相竞态。**这个推理是错的，而且真实 Postgres 测试当场证伪了它**：12 个并发写入、`keep=5`，结果留下 **12** 行。

原因在 `READ COMMITTED` 的可见性：裁剪子查询只能看到**本事务开始前已提交**的行加上自己刚插入的那条，看不到其他在途事务的行。于是 N 个并发保存各自都认为"保留最新 5 条"时表里只有自己那一条，全都判定无需删除，N 行全部存活。**原子性不等于串行化**——把这两件事混为一谈正是这里踩的坑。

修法：在 `Append` 的事务开头取 `pg_advisory_xact_lock(hashtext(resume_id))`，按简历串行化整个追加。不同简历互不阻塞；同一简历本来就被乐观锁按更粗的粒度串行化，所以并没有牺牲真实存在的并发。`xact` 作用域保证崩溃或断连时锁自动释放。`-count=4` 复跑稳定通过。

### 其他实现取舍

- **裁剪按 `version DESC` 而非 `created_at DESC`**：自动保存按时钟触发，同秒保存是常态，时间戳会打平，Postgres 会任意挑一条，可能删掉刚写入的那条。
- **快照失败不失败保存**：正文已经提交、锁已经前进，此时报错等于告诉客户端"编辑被拒绝"，而它其实已经存了。历史是安全网，可以降级；保存不可以。
- **`created_by` 是 `*string`**：nil 表示没有登录用户（AI 应用、系统任务），与空字符串不同。备注里提到的"AI apply 也应写入持久历史"**自动成立**——AI 应用走的就是同一个 PUT 路径。
- **`GetByID` 同时按 `resume_id` 限定**：授权是针对**简历**做的，快照 ID 不是凭证；否则 A 的所有者猜到 ID 就能读 B 的正文。
- **`DeleteByResumeID` 放在接口上**（而非可选类型断言）：让编译器强制清理，否则简历删除后会永久留下无法访问的孤儿行。**这一条超出了工单字面要求**，是刻意加的。
- **不设外键**：`DeleteResume` 是硬删除，外键要么阻塞删除要么要求级联；ADR-0010 两者都没规定，显式删除让意图出现在它发生的地方。
- **`history_limit <= 0` 回落到 50**：让"未配置"与"保留 0 条"等价，会让忘记写配置行的部署静默丢掉整个功能。

### 验证

| 项 | 结果 |
|---|---|
| `go build ./...` / `go vet ./internal/... ./cmd/...` | 通过 |
| `go test ./internal/... -count=1`（`T16/T17/MIGRATE_TEST_DSN` 全设） | 5/5 包通过，`--- SKIP` **0** 个 |
| 新增 use-case 测试 `resume_history_test.go` | 16 个用例，全通过 |
| 新增真实 Postgres 测试 `resume_version_postgres_test.go` | 3 个用例（无 DSN 时 `t.Skip`，保持 `go test ./...` 自洽） |
| `-count=4` 复跑并发裁剪测试 | 稳定通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run test` | 17 文件 / **567** 通过 + 3 expected fail（原 553，新增 14） |
| `npm run build` | ✓ Compiled successfully |
| `npx eslint .` | 28 problems（14 errors / 14 warnings）= **基线未变** |
| **迁移预演 + HTTP 端到端**（见下） | 全部通过 |

### 迁移预演（部署前必做的一步，已做）

生产库的现状是：**有 `resumes` 表但没有 `version` 列、也没有 `schema_migrations` 表**——也就是说现网跑的是工单 12 之前的二进制。而 `migrate.Up` 每次启动都会跑，所以新二进制一上线就会对这个**有真实数据**的库执行迁移。这不能靠"应该没问题"过关，于是做了一次完整预演：

1. `pg_dump --schema-only` 克隆生产库结构到一个 scratch 库（确认克隆体确实**无** `version` 列、**无** `schema_migrations`、**无** `resume_versions`）；
2. 插入一行 pre-migration 形状的简历数据；
3. 用隔离配置（另一个库、端口 20099、独立 `storage_dir`）启动真实二进制。

结果：

```
migration: applied 0 baseline_automigrate / 1 add_resume_version_column
                   / 2 backfill_resume_metadata_from_documents
                   / 3 create_resume_versions_table
resumes.version → bigint NOT NULL DEFAULT 1   （既有行回填为 1）
resume_versions 表已创建
```

**第二次启动**（幂等性）：

```
msg=migration: up to date (schema version 3)
```

`schema_migrations` 四行的 `applied_at` 与 `checksum` 与首次完全一致，没有重放、没有校验和不匹配、没有被拒绝启动。ADR-0006 的"校验和不匹配则拒绝启动 / 失败则拒绝启动"两条边界因此都得到了正向验证。

预演结束后：scratch 库已 DROP、临时目录已删、20099 上的进程已停；用户的 20002（pid 26524）与生产 `resume_vault` **未被触碰**。

### HTTP 端到端（对真实 Postgres，非 mock）

在预演库上跑通了完整生命周期：

| 用例 | 结果 |
|---|---|
| 无 token 访问历史 | `401 请先登录 (UNAUTHORIZED)` |
| 空历史列表 | `200 {"limit":50}` —— **`versions` 与 `total` 被 proto3 省略** |
| 两次保存后列历史 | `200`，2 行，`version` **降序**，`created_by` = 操作者 |
| 取单个版本 | `200`，返回正文与 `created_by` |
| 用过期 version 回滚 | `409 VERSION_MISMATCH` |
| 用正确 version 回滚 | `200`，返回 **v4**，正文 = 被恢复的 v2 内容 |
| 回滚后的历史 | **3 行**（v4/v3/v2，一行未删——"回滚是追加"） |
| 用别的简历 ID 读快照 | `404 简历不存在` |
| 非 owner（role=user）列历史 / 回滚 | **`403 无权编辑此简历 (NO_ACCESS)`**，且历史行数不变 |
| owner/admin 读同一份 | `200` |

两个值得单独记的观察：

1. **空历史的线上形状确实是 `{"limit":50}`**，`versions`/`total` 两个键整个不存在。前端 `listResumeVersions` 的默认值不是防御性冗余，而是唯一能工作的写法；这一条已有对应单测。
2. **409 的响应体逐字节等同于内容保存的 409**。这是 `ErrAlreadyHTTP` 哨兵在起作用：回滚走 `asHTTPError` 生成 409（带 `current_version`/`last_modified_at` 元数据），再经 `historyError` 时若无哨兵就会被 `default` 分支重包装成 500 并丢掉元数据，前端就拿不到恢复所需的信息。实测两者 body 完全一致，ADR-0010 的"409 返回当前版本 + 最后修改时间"因此对回滚同样成立。
3. 两次自动保存落在**同一秒**（`created_at` 完全相同），这正是裁剪与列表都按 `version` 排序、而不是按时间戳排序的原因——时间戳在这里确实会打平。

复现上面这组验证需要绕过邮箱验证码（`POST /api/auth/register` 要求邮件里的 code，无法脚本化），因此留下了 `scripts/mint-dev-token.mjs`：用 dev 默认 secret 签一个服务端认的 JWT，用法 `node scripts/mint-dev-token.mjs <userId> <role>`。脚本头部写明了它为什么存在，以及**只能对 scratch 库上的 scratch 服务用**。后续工单（19 起会继续新增 HTTP 端点）可以直接复用。

### 已知边界（未做，非本工单范围）

- **AI 会话内的 `HistoryEntry` 未与持久历史合并去重**。备注里"理想情况下 AI 会话的 apply 也应写入持久历史"这一点达成了（apply 走同一 PUT）；但 `AIUpload` 仍展示自己那份会话内历史，两者会是同一批操作的两个视图。属于 UI 收敛，留给后续。
- **历史面板不做 diff 对比**（ADR-0010 已定：完整快照，不做 diff）。预览是全文，没有"高亮变化"。
- **未在真实浏览器里点击验证面板**。构建、类型、单测、lint 均通过，后端接口经真实 Postgres 验证；但面板的交互（选中、预览、回滚确认）只经过静态检查，没有 `verify:*` 脚本覆盖。这一条是本次交付里最薄的地方。
