# 架构决策记录（ADR）索引

本目录记录 ResumeVault 的**重要且难以逆转**的技术决策。

每条 ADR 回答同一组问题：当时的背景是什么、考虑过哪些选项、为什么这么选、代价是什么。**后续工作请先读相关 ADR**（见 `docs/agents/domain.md`）。

术语以 [`CONTEXT.md`](../../CONTEXT.md) 为准。若某项工作与已有 ADR 冲突，**显式指出**，不要静默推翻。

| 编号 | 决策 | 状态 | 关键影响 |
|---|---|---|---|
| [0001](./0001-render-engine-selection.md) | 渲染引擎选型 | Accepted | 决定 PDF 能否被 ATS 读取 |
| [0002](./0002-cjk-render-spike.md) | CJK 渲染预注册 Spike 协议 | Accepted | 0001 的前置门禁 |
| [0003](./0003-structured-content-model.md) | 结构化内容模型；frontmatter 降级为交换格式 | Accepted | 消除 YAML 转义 Bug 类问题 |
| [0004](./0004-presentation-state-in-jsonb.md) | 展示态存 JSONB 列 | Accepted | 样式可独立更新，不重写正文 |
| [0005](./0005-ats-report-is-fact-only.md) | ATS 体检只报事实，不报分数 | Accepted | 报告不可辩驳 |
| [0006](./0006-versioned-migrations.md) | 自研版本化迁移器 | Accepted | 取代 `AutoMigrate` 的破坏性局限 |
| [0007](./0007-render-service-boundary.md) | 渲染服务边界与契约 | Accepted | 渲染与领域解耦 |
| [0008](./0008-visual-templates-first-is-ats-safe.md) | 视觉模板；首套必须 ATS 安全 | Accepted | 模板是渲染器，不是内容种子 |
| [0009](./0009-grants-authoritative-visibility-derived.md) | 授权为真相，可见性为派生缓存 | Accepted | 明确镜像列语义 |
| [0010](./0010-content-versioning-and-optimistic-locking.md) | 内容版本与乐观锁 | Accepted | 防自动保存导致的数据丢失 |
| [0011](./0011-audit-events.md) | 安全审计：认证事件 + 审计事件两表 | Accepted | 追责登录/授权/管理员操作；不吞审批链与内容版本 |

## 撰写约定

- 文件名：`NNNN-kebab-case-title.md`，四位编号连续递增，**不重用编号**。
- 状态取值：`Proposed` / `Accepted` / `Superseded by NNNN` / `Deprecated`。
- 标题用中文，文件名用英文（便于工具处理与跨编辑器搜索）。
- **决策被推翻时不要删除原文件**，改为 `Status: Superseded by NNNN` 并说明原因。
