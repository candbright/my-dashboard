# ADR-0009：授权为真相，可见性为派生缓存

- **状态**：Accepted
- **日期**：2026-10
- **相关**：ADR-0006（迁移与索引）

## 背景

后端有**两套并存的可见性机制**，这是有意为之的迁移中间态：

| 机制 | 表 | 语义 |
|---|---|---|
| **授权（Grant）** | `permission_grants` | **事实**：某主体此刻拥有某项权利。唯一真相来源 |
| **审批请求（Approval Request）** | `approval_requests` | **凭证链**：申请与决定的追加式记录，永不改写 |
| **可见性镜像** | `resumes.visibility` / `resumes.approval_status` | **有意保留的历史镜像**——存量部署的历史只存在这里，且 `ListPublicApproved` 的过滤依赖它们 |

后端代码注释明确说明：这四个列**被保留而非删除**，因为 `ListPublicApproved` 靠它们过滤。

### 现存的具体缺陷

**这两列没有任何索引。** `resumes` 表上只有：主键 `id`、`slug` 唯一索引、`user_id` 普通索引。

而 `ListPublicApproved`（公开列表的主查询路径）正是 `WHERE visibility = 'public' AND approval_status = 'approved'`——**这是一次顺序扫描**。

## 评估过的选项

| 选项 | 评估 |
|---|---|
| **A. 维持现状** | 保留双写与无索引。缺陷持续 |
| **B. 语义降级为派生缓存 + 保留列用于查询** | **采纳** |
| **C. 数据迁移后删除两列** | **否决**——删列不可逆，而本仓库的版本化迁移历史**刚刚才在 ADR-0006 引入**。在迁移基建的第一天做破坏性数据迁移，风险与收益完全不成比例 |
| **D. 补索引** | **必做且无争议**，与 B 合并 |

## 决策

**采用 B + D。**

### 1. 明确列的新语义

`resumes.visibility` 与 `resumes.approval_status` 被正式定义为：

> **由授权派生的查询用物化缓存。**

- **业务判断一律查授权**（`permission_grants`），不查这两列。
- 这两列**只服务于查询过滤与性能**。
- 它们由授权模块在变更时同步更新，**没有任何其他代码可以写它们**（后端已如此约定，此处将其上升为架构决策）。

### 2. 补索引（必做）

```sql
CREATE INDEX CONCURRENTLY idx_resumes_visibility_approval
  ON resumes (visibility, approval_status);
```

**注意**：`AutoMigrate` **不会创建这个索引**——必须走 ADR-0006 的迁移器。这是 ADR-0006 存在的直接例证。

**补充（后续修正）**：上面的列序与索引名**维持不变**，已作为迁移 Version 5 落在已部署的库上；ADR-0006 规定已应用的迁移不可改，改列序只能新增一条迁移，因此本 ADR 不改写原有处方，而是补上它**没有覆盖**的那一半。这条索引服务 `ListPublicApproved` / `CountPublicApproved`；**审批队列还需要** `(approval_status, updated_at)`，作为迁移 **Version 6** 新增——因为 `PendingFilter` 里**没有 `visibility` 谓词**（它是 `approval_status = ?`），而列表按 `updated_at ASC` 排序，B-tree 无法从尾列进入，所以两条索引互不替代。

### 2.1 审批队列需要 `approval_status` 打头的索引（Version 6）

```sql
CREATE INDEX CONCURRENTLY idx_resumes_approval_status_updated_at
  ON resumes (approval_status, updated_at);
```

**列序不是排版问题**：`approval_status` 是等值谓词，`updated_at` 是排序键。`ListPending` 是 `WHERE approval_status = 'pending' ORDER BY updated_at ASC LIMIT n`——等值谓词在首列上选出范围，`updated_at` 在该范围内已经有序，于是 `ORDER BY ... LIMIT` 是一次有界的顺序行进，而不是扫描加排序；`CountPending` 只用首列，所以不需要单独为它建索引。反过来写成 `(updated_at, approval_status)` 不行：进入列会变成列表并未约束的 `updated_at`，谓词就退化成全表读过再过滤。

**两条索引的分工**（v5 是 `(visibility, approval_status)`，v6 是 `(approval_status, updated_at)`）：

| 查询 | 谓词与排序 | 由哪条索引服务 |
|---|---|---|
| `ListPublicApproved` / `CountPublicApproved` | `visibility = ? AND approval_status = ?`（全等值） | v5 |
| `ListPending` | `approval_status = ?` + `ORDER BY updated_at ASC` | v6 |
| `CountPending` | `approval_status = ?` | v6 |

v5 服务不了审批队列（`PendingFilter` 没有 `visibility`，无法从尾列进入），v6 服务不了公开列表（该谓词不含 `updated_at`，在 v6 的第二列上不构成范围）。**因此 v5 不会因为 v6 的加入而变成冗余，不可当作“重复索引”删除。**

这是**根据两条查询的谓词推导出的结论**，不是实测的查询计划：本 ADR 不声称对任何数据量做过 `EXPLAIN` 验证，也不给出任何性能数字。v6 同样必须 `CONCURRENTLY` 创建，因此与 v5 一样需要迁移器的非事务路径。

### 3. 不删除列

保留原列。理由：不可逆操作 + 存量数据历史 + 迁移基建刚建立。

**将来若要删除**，必须在①迁移基建已稳定运行、②有完整备份与恢复演练、③有独立的 ADR 记录之后。

### 4. 不做的事

- **不新增 `resume:history` 之类的细粒度权限类型。** `Known()` 是闭集校验，"每个新功能加一个权限类型"会让权限系统膨胀成它自己的产品。版本历史的可见性**跟随简历的现有规则**（owner / admin）。
- **不合并 `approval_requests` 与 `permission_grants`。** 它们是两种语义（凭证链 vs 事实），后端已有明确设计说明，不要"顺手"统一。

## 后果

**正面**
- 公开列表查询从顺序扫描变为索引扫描——**当前的明显缺陷随手修掉**。
- 审批队列同样：v5 只覆盖公开列表，队列的 `approval_status` 单谓词查询本来仍在顺序扫描，Version 6 把它一并修掉。
- 镜像列的语义被写定，不再有"该查哪一边"的歧义。
- 权限系统不被新功能稀释。
- ADR-0006 的迁移器有了第一个真实用例（一个 `AutoMigrate` 做不到的索引）。

**负面 / 代价**
- **双写仍在**：授权变更时必须同步更新镜像列，存在短暂不一致窗口。缓解：在同一事务内完成；镜像列只用于查询，短暂不一致不影响正确性判断。
- 需要一次性校验存量数据的**镜像列与授权是否已对齐**（后端有一次性回填机制 `migration:approvals_backfilled`，可参照）。
- **原先那张索引不足以覆盖审批队列**——这是本节开头那段处方的已知不完整之处，已由 Version 6 补上。代价是 `resumes` 上多一条索引：每次插入与 `approval_status`/`updated_at` 更新都要多维护一棵 B-tree，且不存在一条同时服务两类查询的列序（两类查询的等值列不同）。
- 索引在大型部署上需 `CONCURRENTLY` 创建，不能在事务内执行——**迁移器必须支持非事务迁移**（一个必须的设计约束）。v5 与 v6 都落在这条约束下。

