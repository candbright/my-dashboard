# 15 — 元数据表单编辑面板

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：17（元数据迁入列）
- **Blocks**：26（中文特有字段）
- **ADR**：[ADR-0003](../../../docs/adr/0003-structured-content-model.md)

## 背景

**结构化字段编辑当前不可能。**

原因：后端 `PUT /api/resumes/{id}` 只接受整份 Markdown，并且会**从 frontmatter 重新推导所有元数据列**（`name` / `job_title` / `email` / …）。任何直接改数据库列的表单编辑都会被**下一次保存静默覆盖**。

ADR-0003 的解法：元数据进数据库列，UI 用表单**直接编辑列**；frontmatter 降级为交换格式。

## 任务

1. `resumes` 表列已由工单 17 就位（`name` / `job_title` / `email` / `phone` / `location` / `website` / `github` / `linkedin` / `avatar` / `summary`）
2. **需要新的更新端点**——现有 `PUT` 语义是"替换整份文档"，元数据需要独立的更新路径。选项：
   - `PATCH /api/resumes/{id}`（推荐：语义清晰，后端目前无 PATCH）
   - 或在 `PUT` 中支持"只传元数据"（需与工单 12 的 visibility/markdown 互斥问题一并解决）
3. 新增元数据编辑面板组件，纳入 `ResumeEditor`：
   - 逐字段编辑，带 `label`
   - 邮箱、URL 格式校验（前端 + 后端）
   - **必须使用 `@/components/ui` 的 `Input`**，禁止原生 `<input>`（`AGENTS.md`）
   - 遵守 Natural Organic 规范（`rounded-full` 输入框、`duration-500`）
4. **保存走乐观锁**（工单 12）——与内容共用同一个 `version`
5. **记录一个已知限制**：slug 创建后不可变，因此**无"改公开 URL"能力**。本工单至少要在 UI 上告知用户；实现改名见工单 40

## 验收标准

- [x] 元数据可在表单中逐字段编辑并保存
- [x] 保存后**再保存一次正文**，元数据**不会被覆盖**（这是当前的核心缺陷）
- [x] 邮箱/URL 有格式校验，错误信息为中文
- [x] 使用 UI 组件库的 `Input`，无原生 `<input>`
- [x] 元数据与内容共用 `version`，冲突返回 409
- [x] UI 上明确告知"公开链接不可修改"
- [x] 游客账户不可编辑

## 备注

- ⚠️ 依赖工单 17 的迁移完成——**在那之前编辑列没有意义**（会被 frontmatter 覆盖）。
- `avatar` 列的复用是工单 27（证件照）的基础，本工单只需保证它能被编辑。

## Comments

**已完成。** 任务 1–5 全部实现，7 条验收标准全部通过；并在**真实 Postgres 16.11 上跑真实二进制、走真实 HTTP** 验证过（临时 scratch 库，验证完已删除，生产库未改动）。

### 端点：选了任务 2 的哪个选项

选了**推荐项 `PATCH`**，但路径是 `PATCH /api/resumes/{id}/metadata`，比工单写的 `PATCH /api/resumes/{id}` 更窄，理由有两条：

1. `PUT /api/resumes/{id}` 的语义是"替换整份文档"。把元数据放进同一个路径，客户端就必须靠"body 里有没有 `markdown` 字段"来推断这次请求到底在干什么——这正是工单任务 2 第二选项要解决的"互斥问题"，而独立路径直接绕开了它。**内容保存永远不该触发表单字段的格式校验**，反之亦然。
2. 仓库已有先例：`service.go:86` 的 `r.PATCH("/api/user/ai-config/global", ...)`。

### 补丁语义（关键，容易做错）

wire 格式是 `map<string,string>`，**键缺失 = 不动该列；键存在但值为空 = 清空该列**。这是整个端点的意义所在，也是必须用 map 而不能用 9 个 proto3 标量字段的原因——proto3 的普通标量没有 presence，"清空我的电话"和"别动我的电话"会是同一个请求。

这个区分**只在 `JSON.stringify` 下成立**（`undefined` 被丢掉、`''` 被保留），所以前端两侧都钉了测试：`metadataPatchFromDiff` 只产出变更键，`resume-api.test.ts` 断言序列化后 `phone` 在 `metadata` 里、`name` 不在。一个"顺手把缺失键补成空串"的包装器会**静默清空用户没碰过的每个字段**，而只检查被编辑字段的测试不会发现。

空补丁是 no-op：**不写库、不推进 `version`**。表单在 blur 时会经常产生空补丁，推进版本会让用户手里的 token 失效、下一次保存收到一个无法解释的冲突。

### 实现

**后端**

- **`api/resumevault/v1/resume.proto`**：新增 `rpc UpdateResumeMetadata` → `patch: "/api/resumes/{id}/metadata"`，`body: "*"`；请求 `map<string,string> metadata` + `int64 version`；已重新生成 `resume.pb.go` / `resume_http.pb.go`（`ai.pb.go` 未动）。
- **新增 `internal/biz/resumevault/metadata_validation.go`**：`ValidateMetadataPatch` / `MetadataValidationError{Field,Message}` / `ValidateMetadataValue`。规则放在**领域层而非 HTTP 层**——这是"简历元数据能装什么"的规则，不是 HTTP 的规则，放到领域层后未来的批量导入、管理工具、工单 41 的 MCP 都会继承。消息是中文且**原样透出**，规则与它的解释不会分叉。
  - **长度以 rune 计，不以 byte 计**：一个汉字 3 字节，按字节限长会让合法的 100 字姓名在 34 字时就被拒绝。测试钉了 BMP 外的 `𠮷`（1 rune / 4 字节）。
  - **`name`/`job_title`/`phone`/`location`/`summary` 只限长、不校验格式**：电话格式太杂（国家码、分机、空格、破折号、括号），"拒绝一个正确的号码"比"接受一个难看的号码"糟得多；姓名和职位是用户自己的语言。校验这些就是猜测，而猜测的失败模式是拒绝合法输入。
  - **邮箱用宽松模式**（恰一个 `@`、非空本地部分、域名带点、无空白），不用完整 RFC 5322：完整语法接受注释、引号字符串、域名字面量，而每种实现都会拒绝一些实践可用的地址。**拒绝用户的真实邮箱是他无法修复的**。
  - **URL 允许省略 scheme**（`example.com`）：这是人们实际会输入的形式，渲染时会补 `https://`。但带 scheme 时**只允许 http/https**——`javascript:` / `data:` / `vbscript:` / `file:` 一律拒绝，因为这些值会进 `href`，导出路径上还会进 PDF，**能执行的 scheme 是真实危害而不是格式偏好**。
- **`internal/biz/resumevault/resume.go`**：接口加 `UpdateMetadata(ctx, id, patch, expectedVersion)`；新增 `metadataFieldOrder`（**展示顺序**，也是校验报错顺序——用户先修最上面那个）+ `UpdateResumeMetadata`（`GetByID` → 404；**未知键 400 `UNKNOWN_METADATA_FIELD`，不静默忽略**；然后调 repo，`translateUpdateError` 转 409）。
- **`internal/data/resumevault/resume.go`**：新增 `metadataColumns`（10 个请求键 → 双引号列名）与 `UpdateMetadata`。**只 SET 补丁里点名的列**，`WHERE id = ? AND "version" = ?`，`version = "version" + 1`，`RowsAffected == 0` → `staleVersionError`。
  - 顺带把 `updatesMap` **改名 `contentUpdatesMap` 并收窄**到只有 `{"filename", "updated_at"}`。`Update` 只有一个调用者 `UpdateResumeContent`，它只改这两个字段。原来那张表写全部列，正是"表单编辑被下一次保存覆盖"的实现层成因。
- **`internal/service/resumevault/resume.go`**：`UpdateResumeMetadata` 处理器——未登录 401 `请先登录`；`GetResume` 404；**`isOwner || isAdmin` 否则 403 `无权编辑此简历`**；`checkVersion` 先于格式校验（过期客户端该被告知重载，而不是被带着走一遍马上要被拒的表单）；再校验格式，返回 `resume` + `markdown`。

**前端**

- **新增 `src/lib/resume-metadata.ts`**：`METADATA_FIELDS`（键/中文标签/占位符/输入类型）、`validateMetadataField`、`metadataValuesFromRecord`、`metadataPatchFromDiff`。**一处映射**：列名是 `job_title`，前端标签是「职位」，而 frontmatter 的键是 `title`——这个对应关系原来在每个调用点手工调和，第二份副本就是"某字段悄悄不再保存"的成因。
- **新增 `src/components/ResumeMetadataPanel.tsx`**：十字段表单，用 `@/components/ui` 的 `Input` / `Textarea`（**无原生 `<input>`**），`rounded-full`、`duration-500`、卡片 `rounded-[2rem]`、无重阴影，符合 Natural Organic。保存 = 显式按钮 + blur 提交，**不做逐键保存**：元数据与正文共用一个 `version`，逐键写会每字符吃掉一个版本并与正文 autosave 相撞。
- **`src/lib/resume-api.ts`**：新增 `saveResumeMetadata`，复用 `readFailureBody` / `isVersionConflictStatus` / `parseVersionConflict`，因此 409 抛出的仍是 `ResumeConflictError`（与内容保存同一个类型，调用方处理方式一致）。
- **`src/components/ResumeEditor.tsx`**：原本"接受但故意不用"的 `resume` prop 现在**承载职责**（读列值 + `slug`）。旧的 9 个 `FormField` 换成面板。`onContentChange` 与 `handleSave` 现在传 `{ includeFrontmatter: false }`——**保存路径不再发 frontmatter**（服务端才是唯一权威，发一份就是发一份过期的副本）。
- **`src/lib/resume-builder.ts`**：`editableToMarkdown` 加可选 `includeFrontmatter`，**默认 `true`**，所以 `.md` 导出（自描述文件）行为不变。
- **`src/components/ResumePageClient.tsx`**：元数据 state 提升到这里（补丁必须带**页面持有的** `version`），新增 `handleSaveMetadata` 与 `handleMetadataChange`、`attributeServerError`（把服务端消息映射到字段上——「邮箱格式不正确」出现在十字段表单上方的横幅里，用户得自己猜是哪个字段）。

### 验证（真实 HTTP，不是只有单元测试）

在临时 scratch 库 `resume_vault_t15` 上跑真实二进制（端口 20003），先用 multipart 上传真实 `.md` 建简历，再打端点：

| 场景 | 结果 |
|---|---|
| 合法部分补丁（`name`+`email`） | 200，`version` 1→2 |
| 补丁只含 `job_title` | 200，`name`/`email` **未被清掉** |
| 设电话后再传 `phone: ""` | 200；库中 `phone = ''`（**`IS NULL=false`、长度 0**，是真清空不是 NULL） |
| `email: "not-an-email"` | 400 `{"error":"邮箱格式不正确，示例：name@example.com","reason":"INVALID_METADATA"}` |
| `website: "javascript:alert(1)"` | 400 `链接格式不正确…` |
| `github: "ftp://x.com/a"` | 400 `链接格式不正确…` |
| `job_titel`（拼错） | 400 `{"error":"不支持的字段：job_titel","reason":"UNKNOWN_METADATA_FIELD"}` |
| `version: 1`（过期） | 409，含 `metadata.current_version=5` / `expected_version=1` / `last_modified_at`（前端重载提示要用） |
| `version: 0` | 409 `VERSION_MISSING`，原因写明"本次请求没有携带版本号" |
| 空补丁 | 200，`version` **保持 5**（no-op 验证） |
| 无 token | 401 `{"error":"请先登录","reason":"UNAUTHORIZED"}` |
| 游客 PATCH 别人的简历 | **403 `{"error":"无权编辑此简历","reason":"NO_ACCESS"}`**，且复查确认未写入 |

中文往返也单独验过：用码点构造 JSON（绕开 PowerShell 5.1 的读取器）写入 `name`/`job_title`/`location`，API 返回 `"张三"`/`"后端工程师"`/`"北京市"` 完全正确。**第一次探到 `name:"??"` 是我的测试脚本被 PS 5.1 的编码搞坏了，不是服务端**——服务端忠实存下了它收到的 `?`；`summary`（服务端自己从文档里提取的）一直是正确 UTF-8，这一点反证了链路没问题。

### 真实环境暴露的两个问题（都不是本工单新写的代码）

1. **`fakeResumeRepo.Update` 原来复制全部字段**，比真实仓库更宽松，因此**无法表达"内容保存不得覆盖并发元数据编辑"**——而这正是本工单的核心保证。已改成只结转 `contentUpdatesMap` 覆盖的列，其余从库中值结转。一个无法证伪其目标断言的 fake 比没有 fake 更糟。
2. **`newLockedUsecase` 的 `storageDir` 是零值**，于是 `resume_version_test.go` 里 **11 个测试在进程工作目录写 `r1.body.md`**，且什么都不清理；更要紧的是"文件没被写"这类断言读的是**另一个**目录，因此**通过得毫无意义**。已给统一加 `t.TempDir()`（含 `resume_slug_test.go` 的 6 处）。

顺带清掉了工单 17 留下的**已死功能**：「基本信息」卡片头部的 AI 对话按钮，其上下文取自 `parsed.frontmatter`、结果写回 frontmatter state——工单 17 之后 `parsed.frontmatter` 恒为空，**那个按钮在发空上下文、往没人读的 state 里写**。它按下去"看起来在工作、实际什么也没做"，比没有更糟。已删除（章节级 AI 对话不受影响），删除原因写在代码注释里；针对元数据列重建它是独立工单。

### 门禁

- 后端：`go build ./...` 0；`go vet ./internal/... ./cmd/...` 0；`go test ./internal/... -count=1` **5/5 包通过**（**带** `T17_TEST_DSN`+`MIGRATE_TEST_DSN` 跑真实 Postgres，`--- SKIP` 计数为 **0**，即门控测试确实执行了）；`gofmt` 干净（CRLF 归一化后比对 17 个文件）；无 BOM、无 U+FFFD；`cmd/` 仍只有 `cmd/kratos-server`。
- 前端：`npx tsc --noEmit` 0；`npm run build` ✓ 6.5s；`npm run test` **479 passed | 3 expected fail (482)**，15 文件（工单 17 结束时是 396，本工单新增 83 个）。
- `npx eslint .`：**14 errors / 14 warnings**，与既有基线一致（14 errors 里本工单文件只有工单 08 既有的 `ResumeEditor.tsx:214 react-hooks/refs`，**未新增任何 error**）。warnings 由基线的 15 降为 14，唯一原因是 `eslint.config.mjs` 新增了一条规则：`no-unused-vars` 允许 `^_` 前缀参数，用来表达"这个参数是签名的一部分、故意不用"（如 `handleSaveMetadata(patch, _signal)`），而不是给每处加行内抑制。两条数字都用"临时把该规则块还原"的方式实测过。
- 收尾：scratch 库已 `DROP`、临时二进制与探针已删、端口 20003 已关闭；**真实库 `resume_vault` 未被改动**（仍是 6 张表、无 `schema_migrations`、无 `resumes.version`、1 份简历）；前端 30002 与旧后端 20002 仍在运行，PID 26524 未被触碰。

### 有意未做

- **ADR-0004 的 `presentation` 状态没有一起加进来**（那是工单 19）。现在定 wire 形状会在该 ADR 的工作之前把它锁死。
- `slug` 只**只读展示**并说明"公开链接不可修改：修改会导致已分享的链接失效"。改名是工单 40。
- `onSaveMetadata(patch, signal)` 的 `signal` 当前**收了但没用**：`apiFetch` 没有把 signal 透到 `fetch`，而面板自身的卸载守卫已经能阻止读取迟到响应。为一个调用方改动全 App 共用的 `apiFetch` 不属于本工单；参数名用 `_signal` 并在调用处写明原因。

### ⚠️ 本工单未修、但必须尽快处理的回归（建议并入工单 18）

工单 17 把元数据搬进数据库列、并让服务端不再存储 frontmatter 之后，**前端所有"读元数据"的路径仍然在读 `parsed.frontmatter`——而它现在恒为空**。工单 15 只修好了**编辑**这一条路径（表单改读列）；**展示与导出路径仍然坏的**。本工单没有一并改，原因有两条：这个改动横跨 6 处、7 个文件；而正确的归一化位置属于工单 18「服务端解析器成为唯一权威」的设计空间（其任务 2 明确要求 `GET` 路径消费后端返回的结构化快照）。**在这里临时补一个归一化函数，很可能与工单 18 的方案重复或冲突**，所以选择显式交接而不是静默扩大本工单范围。

影响面比"少几个图标"严重：**预览、PDF/图片导出、纯文本（ATS）导出、`.md` 导出四条用户可见的产出路径同时丢元数据**，而且都是静默失败——不报错、不告警，只是空白。

已确认受影响的位置（均为"读到空值 → 静默不渲染"，不报错）：

| 位置 | 后果 |
|---|---|
| `ResumeDisplay.tsx:62-70,124-151` | **预览页不显示邮箱/电话/地点/网站/GitHub/LinkedIn/头像，也不显示姓名与职位**，只剩 `resume.title` 兜底 |
| `ResumePrintView.tsx:64-68` | **打印/PDF/图片导出的联系方式整块消失**——工单 03 的核心产物 |
| `resume-text.ts:203` | **纯文本（ATS）导出的姓名/职位/邮箱/电话/地点/链接全部消失**——工单 06 的核心产物，收件方正是招聘系统 |
| `ResumeBuilderPage.tsx:178` | 简历命名 `parsed?.frontmatter?.name \|\| '简历'` 恒走兜底 |
| `ResumeSplitEditor.tsx:42,52-60` | 拆分编辑器保存时写回全 `null` 元数据 |
| `ResumeEditor.tsx:169,202` | `frontmatter` state 已**不可达**：工单 15 删掉了唯一编辑入口，`setFrontmatter` 只在 reset 时被调用且值来自恒空的 `parsed.frontmatter`，而 `parsedToEditable` 正是从 `parsed.frontmatter` 初始化的。于是 **`.md` 导出违背 ADR-0003 第 59 行**（"导出：产出带合法 YAML frontmatter 的 `.md`"）——现在导出的 `.md` 是纯正文。`editableToMarkdown` 的序列化能力还在（默认 `includeFrontmatter: true` 且有测试），但**生产代码里两处调用都传了 `false`，所以带 frontmatter 的导出路径实际上没有任何调用者** |

另一处细节：`PlainTextContact` 用的是 frontmatter 键（`title`），而列名是 `job_title`；`ResumeRecord` 又是 `job_title`。所以归一化**不是把对象直接传过去就够**，必须显式做这个键映射——这正是 `resume-metadata.ts` 里 `METADATA_FIELDS` 存在的理由，建议复用它。

建议：并入工单 18（它已经在设计"前端从哪里取结构化数据"），并在其验收里补一条"预览与全部四种导出（PDF／图片／纯文本／`.md`）的元数据来自数据库列，且 `.md` 带合法 YAML frontmatter（ADR-0003）"。若希望更早修，也可以在工单 18 之前单独插一个小工单——修复本身很小（一个 `record → ParsedResume.frontmatter` 的归一化 + 键映射），风险在于放到哪个层次。

### 遗留

- 生产库仍未迁移、PID 26524 仍是旧二进制；上线动作未执行（与工单 17 的遗留一致）。
- `attributeServerError` 靠"服务端消息里出现字段名或标签"来定位字段。字段名与标签都来自同一份导出列表，所以不会两边各写一份而漂移；但服务端若把消息改成不含这两者的措辞，错误就只会留在横幅上——不会错误标注，只是少一层高亮。

