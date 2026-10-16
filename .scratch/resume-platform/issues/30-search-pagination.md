# 30 — pg_trgm 搜索 + 分页

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：11（迁移器）、09（硬上限）
- **Blocks**：—
- **ADR**：[ADR-0006](../../../docs/adr/0006-versioned-migrations.md)、[ADR-0009](../../../docs/adr/0009-grants-authoritative-visibility-derived.md)

## 背景

`ListResumesRequest` 只有 `scope` 字段——**无搜索、无分页、无排序**。工单 09 先做了硬上限防炸，本工单做体验。

### 为什么选 `pg_trgm` 而不是 `tsvector`

**`tsvector` 对中文几乎不可用**——它按空格与标点切词：

```sql
to_tsvector('simple', '前端开发工程师')  -- 切出一整块，搜不到「开发」
```

要修必须装 `zhparser` 或 `pg_jieba`，而本项目的 Postgres 是裸的 `postgres/postgres@localhost:5432`——**装扩展会污染部署**。

用户的真实检索意图是"**找那份投字节的简历**"，属于**短字符串模糊匹配**。`pg_trgm` 的 `ILIKE` + GIN 索引**既对中文有效、又不需要额外扩展**。

## 任务

### 1. 索引（走工单 11 的迁移器）

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 按标题与摘要模糊搜索
CREATE INDEX CONCURRENTLY idx_resumes_title_trgm ON resumes USING gin (title gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_resumes_name_trgm  ON resumes USING gin (name  gin_trgm_ops);

-- ADR-0009 要求的公开列表复合索引（AutoMigrate 做不到）
CREATE INDEX CONCURRENTLY idx_resumes_visibility_approval
  ON resumes (visibility, approval_status);

-- 排序常用
CREATE INDEX idx_resumes_user_created ON resumes (user_id, created_at DESC);
```

> ⚠️ `CONCURRENTLY` **不能在事务内执行**——工单 11 的迁移器必须支持非事务迁移。

### 2. 查询接口

- proto 增加：`query`（搜索词）、`page`、`page_size`、`sort`、`order`
- 搜索范围：`title`、`name`（可选 `summary`）
- 响应增加：`total`、`page`、`page_size`
- **`page_size` 有上限**（沿用工单 09 的 200）

### 3. 排序

- `created_at`（默认，倒序）
- `updated_at`
- `title`

### 4. 前端

- 搜索输入框（debounce）
- 分页控件
- 排序选择器
- 空结果用 `<EmptyState>`（`AGENTS.md` 要求）
- 遵守 `AGENTS.md`：`Input`、`Select`、`duration-500`

## 验收标准

- [ ] 搜索中文关键词能命中（如搜「字节」命中含该词的简历）
- [ ] 搜索走索引（`EXPLAIN` 验证，**不是顺序扫描**）
- [ ] 分页正确，`total` 准确
- [ ] `page_size` 超上限被拒绝
- [ ] 三种排序可用
- [ ] 公开列表查询走复合索引（ADR-0009 的核心目标）
- [ ] 迁移器能执行 `CONCURRENTLY` 索引
- [ ] 空结果展示 `<EmptyState>`
- [ ] 后端测试覆盖查询与分页边界

## 备注

- ⚠️ `pg_trgm` 对**极短查询**（1 个字符）效果差，且中文单字检索意义不大——建议要求**至少 2 个字符**。
- 顺带处理工单 09 记录的**审批队列上限 200 无 offset** 的同类缺陷。
- 全文检索若将来真的需要（如搜简历正文内容），再评估 `zhparser`——**但那会改变部署要求，需要独立决策**。

## Comments

（待填）
