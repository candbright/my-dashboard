# ADR-0011：安全审计事件（认证表 + 操作变更表）

- **状态**：Accepted
- **日期**：2026-04
- **相关**：ADR-0006（迁移）、ADR-0009（授权 vs 审批凭证链）、ADR-0010（内容版本，**不是**审计）

## 背景

ResumeVault 没有业务审计模块。登录成败不落库，`users` 无最后登录时间；管理员改角色、手动授权/撤销、改全局 AI，都没有「谁在何时做了什么」的记录。`permission_grants` 在撤销时**删行**，手动授予也没有对应的 `approval_requests`，授权变更史会丢。

已经存在、容易被误叫成「日志」的三样东西语义不同，不能吞掉或充当审计：

| 现有机制 | 表 | 真正的工作 |
|---|---|---|
| 审批请求 | `approval_requests` | **凭证链**：谁申请、谁批、为何；追加式，撤销不改写（ADR-0009） |
| 授权 | `permission_grants` | **当前事实**：批准时插入，撤销时删除 |
| 简历文档版本 | `resume_versions` | **内容快照**：为回滚与乐观锁，不含展示态（ADR-0010） |

运维侧也没有成功请求的 HTTP access log：`internal/server/http.go` 只在失败时把错误打到进程日志。进程日志不是给管理员追责用的产品面。

在线简历 `GET /api/resumes/by-slug/{slug}` 不记访问。那是产品访问记录，隐私模型与安全审计不同，**第一期不做**。

## 评估过的选项

| 选项 | 评估 |
|---|---|
| **A. 所有 HTTP 自动落库** | **否决**。拿不到授权撤销前的 grant、角色 before/after；会把 `GET /api/auth/me` 浸进审计表。与「主职责 = 安全审计」冲突 |
| **B. 按中文名拆四张表（登录/操作/访问/变更）** | **否决**。访问表第一期为空；操作与变更查询模式相同；用户「我的活动」必须 UNION |
| **C. 一张 `audit_events` 通吃登录** | 可做。登录失败量大、仅管理员可查、字段（email、method）与变更事件不同，清理周期也不同 |
| **D. 独立 audit 包 + 两张表 + usecase 显式 Record** | **采纳**。「通用」指包与 schema 可被后续服务接入，不是 HTTP 中间件自动记账 |

## 决策

**采用 D。** 主职责是**安全审计**，附属是敏感字段的**变更摘要**（不含简历正文）。

### 1. 两张追加式表

由 ADR-0006 迁移器建表（禁止 `AutoMigrate` 当演进手段）。行只插入、到期硬删；**没有**更新/删除 API。

**`auth_events`**（默认保留 90 天）——认证尝试，仅管理员可查。

| 列 | 说明 |
|---|---|
| `id` | uuid pk |
| `occurred_at` | timestamptz |
| `action` | 点分英文，见 §5 |
| `outcome` | `success` / `failure` |
| `user_id` | 已知用户，可空 |
| `user_username` | 当时用户名快照，可空 |
| `email` | **规范化**邮箱（trim + lower）。失败登录也要能归户 |
| `remote_addr` | 直连对端 |
| `x_forwarded_for` | 原样保存。管理页优先展示转发链最左；经 Next.js rewrite 时 `remote_addr` 经常是 Next 进程 |
| `user_agent` | |
| `request_id` | 见 §6 |
| `payload` | jsonb，无密钥、无密码、无验证码明文 |

索引：`(occurred_at DESC)`、`(user_id, occurred_at DESC)`、`(email, occurred_at DESC)`、`(action, occurred_at DESC)`。

**`audit_events`**（默认保留 180 天）——敏感写操作与变更摘要。管理员查全局；用户只能 `actor_id = 我 OR subject_id = 我`。

| 列 | 说明 |
|---|---|
| `id` | uuid pk |
| `occurred_at` | timestamptz |
| `action` | 点分英文，见 §5 |
| `outcome` | `success` / `denied` |
| `actor_id` / `actor_username` | 操作者及当时用户名快照 |
| `subject_id` / `subject_username` | 被作用者（改角色、授权对象）；与 actor 相同时仍可写，便于「对我做的事」 |
| `resource_type` | `user` / `resume` / `grant` / `approval` / `ai` |
| `resource_id` | 资源主键或授权 triple 的稳定字符串 |
| `remote_addr` / `x_forwarded_for` / `user_agent` / `request_id` | 同认证表 |
| `payload` | jsonb，见 §4 |

索引：`(occurred_at DESC)`、`(actor_id, occurred_at DESC)`、`(subject_id, occurred_at DESC)`、`(action, occurred_at DESC)`、`(resource_type, resource_id, occurred_at DESC)`。

改名或软删用户后，历史行仍显示快照用户名；管理端可用 ID 跳转（用户已删则只显示快照）。

### 2. 写入路径：显式 Record，不是 HTTP 拦截器

`internal/biz/audit` 提供 `Recorder`。HTTP 过滤器只把 `request_id`、IP、UA 放进 context，usecase **显式** `Record`。

失败语义：

- **变更成功路径**与业务**同一事务**：审计插入失败则整笔回滚（改角色、授权、审批决定、简历删除/回滚/元数据、资料、AI 配置）。没有审计的成功变更，等于没有审计。
- **认证路径尽力写**：`auth_events` 失败打进程日志，登录/注册仍放行。审计库故障不能变成全站无法登录。
- **授权拒绝**（管理员接口 403、`GUEST_READONLY`、非管理员改角色/授权）尽力写入 `outcome=denied`。普通未登录 401、404 不记。

现有 usecase 若尚无事务，由这次接入补上：业务写入与 `Record` 必须能共享同一个 `*gorm.DB` 事务。不得在 handler 里先成功再补插。

### 3. 不记什么

- 简历正文的每次保存（含自动保存）。正文时间线是 `resume_versions` + `ResumeHistoryPanel`（ADR-0010）。回滚**要**记，因为它是高风险动作，payload 只含 version 指针。
- 展示态变更（模板/颜色）。
- 在线简历访问、HTTP 成功 access log。
- AI parse/chat 调用。那是 **AI 用量记录**，不进本模块。
- 发送验证码、登出（无服务端会话）。
- 密钥、密码、验证码明文；邮箱/电话的新旧值。

### 4. 脱敏

- 密钥：只记 `kind=key_set|key_clear|key_rotate`，永不写值。
- 简历元数据、个人资料：payload 只含**变更过的字段名**，不含新旧值。审计能回答「联系方式改过」，不能重建通讯录。
- 角色变更：`before` / `after` 为 `user` / `admin`（不是 PII）。
- 授权：permission triple + 授予/撤销；不复制整张 grant 行。
- 审批：只存 `request_id` 指针，不复制 `approval_requests`。
- 用户 API **不返回** `remote_addr`、`x_forwarded_for`、`user_agent`。管理端返回。

### 5. 动作目录

中文标签由服务端下发（与审批模块的 `resourceTypeLabels` 同一套路）。前端不准写死动作名。

**`auth_events.action`**

| action | 标签 |
|---|---|
| `auth.login.password.success` / `.failure` | 密码登录成功 / 失败 |
| `auth.login.code.success` / `.failure` | 验证码登录成功 / 失败 |
| `auth.register.success` / `.failure` | 注册成功 / 失败 |
| `auth.login.guest.success` | 游客登录 |

登录失败不区分「无此用户」与「密码错」，与现有 `AUTH_FAILED` 文案一致。

**`audit_events.action`**

| action | 标签 |
|---|---|
| `user.role.change` | 变更角色 |
| `grant.create` / `grant.revoke` | 授予权限 / 撤销权限 |
| `approval.submit` / `.withdraw` / `.decide` | 提交审批 / 撤回 / 决定 |
| `resume.create` / `.delete` / `.rollback` | 创建简历 / 删除 / 回滚 |
| `resume.metadata.update` | 更新简历元数据 |
| `user.profile.update` | 更新个人资料 |
| `ai.global.change` | 变更全局 AI（`payload.kind` 细分 provider CRUD / 密钥 / 活跃项） |
| `ai.user.config.change` | 变更个人 AI 配置（`payload.kind` 细分） |

### 6. Request ID 与 IP

新增 HTTP 过滤器：请求已带 `X-Request-Id` 则透传，否则生成。写入响应头，并放入 context，两张表都存。

IP 存两列，管理页优先展示 `x_forwarded_for` 最左，缺失则 `remote_addr`。不假装一定是浏览器地址。

### 7. 保留期与防篡改

仅部署配置，**不是**管理页开关：

```yaml
audit:
  auth_retention_days: 90
  events_retention_days: 180
```

与 `resume.history_limit` 相同：`<= 0` 表示未配置，回落到默认值，而不是「永久」或「保留 0 天」——后者会让忘记写配置的部署静默毁掉审计或瞬时删光。

管理员**不能**改保留期、不能删行、不能清空。到期由 kratos-server **进程内每日任务** `DELETE WHERE occurred_at < 截止`；启动时也跑一次。删失败打进程日志，不挡业务。

### 8. 查询 API 与产品面

分页沿用现有列表语义：`limit` 默认 50、上限 200，响应 `total` + `truncated`，按 `occurred_at DESC`。

| 方法 | 路径 | 谁 |
|---|---|---|
| GET | `/api/admin/audit/auth` | 管理员。过滤：时间、action、outcome、actor/`user_id`、email |
| GET | `/api/admin/audit/events` | 管理员。过滤：时间、action、resource_type、actor_id、subject_id、outcome |
| GET | `/api/me/audit-events` | 登录用户。强制 `actor_id=me OR subject_id=me`；过滤仅时间、action、resource_type。忽略 actor_id / IP 等参数。不返回 IP/UA |

自定义 JSON handler、camelCase，与现有管理接口一致。第一期**不**做 CSV 导出。

前端：

- `/admin/audit`：侧栏「审计日志」，Tab「认证」/「操作与变更」
- `/settings/activity`：设置侧栏「我的活动」。游客 **403**（`GUEST_READONLY`），页面不可用

不含登录（用户侧）、不含正文版本、不含访问记录。

### 9. 与既有 ADR 的边界

- **不推翻 ADR-0009**：审批仍只活在 `approval_requests`；审计存指针。授权仍是当前事实；审计补上授予/撤销（含手动）这条被删行抹掉的历史。
- **不推翻 ADR-0010**：`resume_versions` 仍是内容快照。审计不记每次保存。用户看正文历史仍走 `ResumeHistoryPanel`。
- **不新增授权类型**：读审计的权限是「管理员看全部 / 登录用户看与自己相关 / 游客不可」。

## 后果

**正面**

- 角色、授权、管理员 AI、登录成败可追责。
- 手动授权/撤销不再无痕。
- 用户能看见「我做过什么」和「管理员对我做了什么」，不必也不该看见全局登录喷洒。
- 写入契约可被下一个 kratos 服务复用，而不把 ResumeVault 做成通用 HTTP 日志平台。

**负面 / 代价**

- 每个已列动作的成功路径必须能进事务；部分 usecase 今天没有事务，要改。
- 拒绝事件是尽力写，磁盘满时仍可能丢 403 记录；成功变更不会。
- 经 rewrite 的 IP 可能不准；两列并存是刻意的诚实。
- 到期硬删不可恢复；需要备份策略的部署自己做库级备份。
- 元数据审计没有新旧值，纠纷时不能从本表证明「改成了哪个邮箱」。

**明确不做（第一期）**

- 在线简历访问记录、HTTP access log、导出、用户查看登录、展示态审计、把 `approval_requests` 或 `resume_versions` 复制进审计表。

## 实施时必须遵守

- 表通过版本化迁移创建（ADR-0006）。
- 术语用 CONTEXT.md「审计事件 / 认证事件 / 活动」，不要用「日志模块」当表名或 API 名。
- 前端用既有原子组件与自然有机风；管理页挂现有 `admin/layout` 侧栏。
