# 17 — 元数据迁入列，剥离 frontmatter

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：11（迁移器）
- **Blocks**：15（元数据编辑）、18（解析器收敛）、26（中文特有字段）
- **ADR**：[ADR-0003](../../../docs/adr/0003-structured-content-model.md)

## ⚠️ 这是破坏性数据迁移

**必须在迁移前落全库备份。** 迁移函数**只做加法，不做删除**（原 frontmatter 保留在磁盘文件中，直到确认迁移成功）。

## 背景

简历内容当前**由两套解析器各自解释**：

| 位置 | 内容 | 解析者 |
|---|---|---|
| `{uuid}.md` | frontmatter + 正文 | 前端 `gray-matter`；后端手写 `parseFrontmatter` |
| `resumes` 表列 | `name` / `job_title` / … / `summary` | 后端从 frontmatter 抽取 |

后端那套是**手写的 `key: value` 逐行解析**——无引号规则、无嵌套、无转义。前端那套是完整 YAML。**同一文件两端可能解析出不同结果。**

已发生的缺陷：前端拼接 frontmatter 不加引号，值含 `:` 或 `#` 产出非法 YAML → 简历**回读失败**。

ADR-0003 的决策：**元数据进数据库列；简历文档不含 frontmatter；frontmatter 降级为交换格式。**

## 任务

1. **补全列**：审视 frontmatter 中当前**未被落库**的字段（如 `job_title` 之外的键），补齐对应列
2. **一次性数据迁移**（走工单 11 的迁移器）：
   - 遍历所有 `{uuid}.md`
   - 用**完整 YAML 解析器**（不是手写 `key: value`）解析 frontmatter
   - 写入对应列
   - **不删除文件内容**——先生成"剥离 frontmatter 后"的新内容写入**新文件**或记录待切换标记
3. **切换读取路径**：确认所有元数据读取都走列之后，再执行剥离
4. **导入路径**：接受带 frontmatter 的 `.md`，解析其元数据并写入列（**用真正的 YAML 序列化器**）
5. **导出路径**：产出带合法 YAML frontmatter 的 `.md`，**用 YAML 序列化器而非字符串拼接**
6. **淘汰后端手写解析器**：`parseFrontmatter` 与 `extractSummaryFromMarkdown` 的作用域收缩到"仅导入时使用"，或一并替换为标准 YAML 实现

## 验收标准

- [x] 存量简历的元数据全部正确迁入列（抽样比对迁移前后）
- [x] **运维前后对比可复现**——迁移脚本可在备份库上重放
- [x] 迁移后：修改列 → 保存正文 → **列不被覆盖**
- [x] 含 `:` 和 `#` 的字段值往返（导出 → 导入）**不丢不坏**
- [x] 后端不再有手写的 `key: value` 解析器参与**运行时**路径
- [x] `.md` 导出产出的 frontmatter 是合法 YAML
- [x] 迁移前有备份，`DEPLOY.md` 写明恢复步骤

## 备注

- ⚠️ **ADR-0003 的直接效果**：YAML 转义 Bug **不需要被修，它被移出关键路径**。本工单不要"顺手修一下加引号"，而是消除对 frontmatter 的运行时依赖。
- `summary` 列当前由 `extractSummaryFromMarkdown` 按章节标题（`## 关于我` / `## 简介` / `## About` / `## Summary`）抓取——这套启发式与前端解析是两套实现，需一并收敛。
- 迁移复杂度高，**建议先在小规模库上演练**。

## Comments

**已完成。** 任务 1–6 全部实现，7 条验收标准全部通过；后端在**真实 Postgres 16.11 + 真实简历文件**上验证过，不只是单元测试。

### 实现

- **新增 `internal/biz/resumevault/frontmatter.go`**（265 行）：`ResumeMetadata` + `ParseFrontmatter` / `StripFrontmatter` / `SerializeFrontmatter` / `ComposeDocument` / `ImportDocument` / `ExtractSummaryFromMarkdown`，YAML 由 `gopkg.in/yaml.v3` 负责。
- **新增 `internal/biz/resumevault/metadata_backfill.go`**：`BackfillMetadataFromFiles(db, storageDir, logger)`。逐行读文件 → 解析 frontmatter → 剥离正文写入 `{uuid}.body.md` → 一条 UPDATE 同时写列与 `filename`。
- **`internal/data/data.go`**：迁移 `version = 2`（`backfill_resume_metadata_from_documents`）调用上述函数。`migrate.ScopedDB.Raw` 返回 `migrate.TxDB`，Go 没有协变返回，所以加了 `metadataExecer` / `metadataQuery` 两个适配器。
- **`resume.go`**：删除手写 `parseFrontmatter`；`GetResumeContent` 走 `resolveStoredPath`（优先 `.body.md`，回退原文件）+ `StripFrontmatter`；`UpdateResumeContent` **不再触碰任何元数据列**（删掉 9 处赋值）。
- **前端**：`resume-builder.ts` 的 `editableToMarkdown` 改用 `js-yaml` 的 `dump`（导出路径）；`resume-builder.test.ts` 里承载该缺陷的 `it.fails` 分组转为 12 个正常用例。

### 迁移的形态（与工单第 2 条的偏差，需留意）

工单写"不删除文件内容——写入**新文件**或记录待切换标记"。实现选了**新文件**：原 `{uuid}.md` 原样保留，正文写进 `{uuid}.body.md`，`resumes.filename` 在同一条 UPDATE 里切过去。

好处是**迁移确认之前，frontmatter 在存储卷上有一份独立于数据库的副本**——这一点很重要，因为 frontmatter 只在文件里，**只 `pg_dump` 数据库是不可恢复的**。`DEPLOY.md` 新增的 8.3 节因此要求数据库与文件**两步都备份**。清理原文件的步骤也写在那一节，且标注了"必须先有可解压的备份"。

「先切换读取路径、再剥离」对应任务 3：`GetResumeContent` 先切到 `resolveStoredPath`（能同时读两种文件名），同一个迁移里才做剥离。

### 真实数据库验证发现的 3 个缺陷（单元测试全都测不到）

新增 `internal/biz/resumevault/metadata_backfill_postgres_test.go`，按仓库既有的 `MIGRATE_TEST_DSN` 约定用 `T17_TEST_DSN` 门控；不设 DSN 时 `go test ./...` 保持无外部依赖。

它第一次跑就报了三个**会让服务启动失败**的问题——这些在内存 fake 上永远是绿的：

1. **GORM 无法把 SQL NULL 扫进 Go `string`。** `resumes` 的元数据列全部可空（只有 `title`/`slug` 是 `NOT NULL`），而迁移只写"空着的"列——**正是这些列在存量数据里是 NULL**。结果是 `can't scan into dest[2]: cannot scan NULL into *string`，迁移失败、服务拒绝启动。这条一定会命中生产库。修法：SELECT 里对每个可空列 `COALESCE(..., '')`。
2. **标识符用了反引号。** Postgres 不接受 MySQL 风格的反引号，UPDATE 直接 `syntax error at or near "`"`。改用标准双引号。我原来的代码注释还写着"反引号是 GORM/Postgres 的语法"——那句话本身就是错的。
3. **fake 的 SQL 解析器没跟着改。** 修完引号后 fake 仍按反引号剥离，于是每个列名变成 `"name"` 而不是 `name`，写入落到了没人读的键上，所有断言读到空字符串。**这是最难查的一个**，因为它伪装成业务逻辑出错。现在 fake 遇到未知列名会直接报错，不再静默接受。

教训写在测试注释里：fake 能验证**决策**，验证不了 **SQL 本身**。一个部署时才炸、且没有测试覆盖的 UPDATE，正是最该用真实数据库测的东西。

第 1 条也说明"补全列"（任务 1）在**行为**上才是关键，不在 schema 上：对现有 3 个文件清点后，没有任何 frontmatter 键缺少目标列。真正的问题是那些列**可以**是 NULL，而迁移必须容忍。

### 验收标准逐条

- [x] **存量元数据全部正确迁入列** — 真实库上 4 个夹具（含 2 个真实文件的字节）：带 `:` 的值 `高级工程师: 后端`、带 `#` 的值 `李四 # 平台组`、`https://example.com/p#section`、引号包裹的数字 `'13800138000'` 全部**逐字**落列；无 frontmatter 与空 frontmatter 的文件不报错、也不臆造值。
- [x] **运维前后对比可复现** — 测试在独立 schema 上跑真实函数，第二次运行 `updated = 0`、`relocated = 0`；`DEPLOY.md` 8.3 节给了重放命令。幂等是"前后对比"有意义的前提。
- [x] **迁移后改列 → 保存正文 → 列不被覆盖** — `UpdateResumeContent` 已删除全部 9 处元数据赋值，只写正文与 `filename`。跨请求的交错由 ADR-0010 的 `WHERE version = ?` 兜住：任何并发写都会推进 `version`，过期写入得到 409 而不是静默覆盖（`version` 的 CAS 由工单 12 的既有测试覆盖）。
- [x] **含 `:`/`#` 往返不丢不坏** — 后端走 `yaml.Marshal`，前端走 `js-yaml` 的 `dump`；前端一侧探过 17 个特殊值（`:`、`#`、`&`、`*`、`[`、`{`、`- `、`@`、`%`、换行、`true`、`0123`、尾随空格）均精确往返。**没有去"顺手修一下加引号"**，而是按备注把转义 bug 移出关键路径。
- [x] **后端运行时无手写 `key: value` 解析器** — `parseFrontmatter` 已删除；`ExtractSummaryFromMarkdown` 保留但作用域收窄到**仅导入与回填**，正文保存路径不再经过它。它从**已剥离**的正文取摘要，所以摘要不可能含元数据。
- [x] **`.md` 导出 frontmatter 是合法 YAML** — 由 `js-yaml` 的 `dump` 产出（前端导出路径），不再是 9 行字符串拼接。后端 `SerializeFrontmatter` 对零值元数据返回空串，输出形如 `---\n<yaml>\n---\n\n`。
- [x] **迁移前有备份，`DEPLOY.md` 写明恢复步骤** — 新增 8.3 节：数据库 + 文件两步备份、备份库演练、前后对比查询、按"先文件后数据库"顺序恢复、以及迁移确认后清理原文件的前置条件。

### 门禁

- 后端：`go build ./...` 0；`go vet ./internal/... ./cmd/...` 0；`go test ./internal/... -count=1` 5/5 包通过（**带** 与 **不带** `T17_TEST_DSN` 各跑一遍都通过，保持无 DSN 时无外部依赖）；`gofmt` 干净（CRLF 归一化后比对）；无 BOM、无 U+FFFD。
- 前端：`npx tsc --noEmit` 0；`npm run build` ✓ 8.4s；`npm run test` **396 passed | 3 expected fail (399)**，14 文件；目标文件 `npx eslint` 仅剩工单 08 既有的 `ResumeEditor.tsx:163 react-hooks/refs`（本次顺带消掉了 `ResumeSectionItem` 未使用告警）。
- `go.mod`：`gopkg.in/yaml.v3` 与 `github.com/jackc/pgx/v5` 由 indirect 提升为直接依赖（2 增 2 删）。
- 临时探针 `cmd/t17audit/`、`cmd/pgprobe/`、`cmd/t17verify/` 已全部删除；`cmd/` 只剩 `cmd/kratos-server`。测试用的 scratch schema 全部清理，**生产库未被改动**（仍是 6 张表、无 `schema_migrations`、1 份简历——即迁移从未在生产库上执行过）。

### 已知过渡态（有意为之，不是故障）

迁移后服务端只存正文，因此 `ResumeEditor` 里那个 frontmatter 表单会显示为空，而 9 个列的值都是好的、API 返回的 `resume.name` 等字段正常。**工单 15（元数据编辑面板）必须从列读取元数据，而不是解析 frontmatter**，届时那个表单会被替换掉。这一段也写进了 `DEPLOY.md` 8.3 节，避免运维误判。

### 遗留

- 迁移器没有 Postgres advisory lock，多实例并发启动会竞争。当前部署是单实例，暂不处理。
- 生产库（`resume_vault`）与运行中的 PID 26524 仍是迁移前的状态；上线动作未执行——本次只做到"代码就绪 + 在等价环境验证"。

