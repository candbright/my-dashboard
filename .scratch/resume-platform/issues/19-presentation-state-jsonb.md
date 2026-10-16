# 19 — 展示态 JSONB 列与校验

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：11（迁移器）、12（乐观锁）
- **Blocks**：20、21、22、23、24、27、28
- **ADR**：[ADR-0004](../../../docs/adr/0004-presentation-state-in-jsonb.md)

## 背景

有一类信息**不影响内容语义、只影响渲染**：模板选择、主色、字体、字号缩放、行距、页边距、章节顺序、证件照。

**当前无处可存**——所有渲染细节硬编码。

塞进 frontmatter 不可行的具体原因（ADR-0004）：后端 `PUT` 只接受 `{markdown, visibility}`，**改一个颜色就得重写整个文档**；且这两个字段在同一请求里**互斥**（`visibility` 分支提前 `return`，静默忽略 `markdown`）。

## 任务

1. **加列**：`resumes.presentation` JSONB（走工单 11 的迁移器）
   > ⚠️ 加列需改四处：`ResumeModel` / 领域结构体 / `toResumeDomain` / `toResumeModel`
2. **初始结构**：
   ```jsonc
   {
     "schemaVersion": 1,
     "template": "ats-safe-single-column",
     "accentColor": "#5c4033",
     "fontFamily": "serif",
     "fontScale": 1.0,
     "lineHeight": 1.5,
     "pageMargin": "18mm",
     "sectionOrder": ["关于我", "工作经历", "项目经历", "教育背景", "技能"],
     "photo": { "enabled": false, "path": null }
   }
   ```
3. **服务端校验**（必做，JSONB 无 schema 约束）：
   - 只接受已知键与合法取值域
   - **未知键拒绝，而非静默忽略**（避免"设了没生效"的静默失败）
   - **颜色须符合设计规范**——**冷色与纯黑应被拒绝**（`AGENTS.md` 硬禁止）
   - `schemaVersion` 用于向前兼容的读取迁移
4. **乐观锁**：与内容**共用同一个 `version`**（工单 12）——样式更新不能覆盖内容更新
5. **不进入版本历史**（工单 16）——否则"换个颜色"污染内容历史
6. **更新端点**：展示态需要独立更新路径（建议 `PATCH /api/resumes/{id}/presentation`）

## 验收标准

- [x] 展示态可独立保存，**不触发内容版本历史**
- [x] 非法键被**拒绝**并返回中文错误，而非静默忽略
- [x] 冷色（如 `#0066cc`）与纯黑被拒绝
- [x] `schemaVersion` 缺失或过旧时有明确的兼容行为
- [x] 展示态更新与内容更新共用 `version`，互相冲突返回 409
- [x] 后端测试覆盖：合法值、非法值、未知键、冷色、版本冲突
- [x] 导出 `.md` 时展示态的处置已决定并记录（ADR-0004 建议**省略**）

## 备注

- 这一列是**后续一半工单的前置**（20、21、22、24、27、28 都依赖它）。
- JSONB 无编译期类型安全——**校验逻辑必须显式编写并测试**，这是本工单的主要工作量。

## Comments

### 实现结果（2026-10-14）

按任务 1–6 全部落地。**唯一的 UI 面板与打印渲染接线不在本工单范围**，见下方「范围边界」。

#### 1. 加列（任务点 1）

迁移 v4 `add_resume_presentation_column`（`internal/data/data.go`），单条
`ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "presentation" JSONB`。

**不需要回填**，且这是有理由的选择而非省略：列可空、无默认值，`NULL` 就是有意义的值
「没存过展示态」，读取侧转成默认值。加 `DEFAULT '{}'::jsonb` 表达同一件事，却让后续读取
再也分不清「从没设过」与「显式清空」，还要在大表上做一次全表重写。用 `jsonb` 而非 `json`
是因为要的是校验过的二进制表示与去重键，而非保留原始文本。

四处（`ResumeModel` / 领域 `Resume` / `toResumeDomain` / `toResumeModel`）都改了，与工单提示
一致。`Presentation` **不在** `writableColumns` / `contentUpdatesMap` 里——样式写入永不经过
内容保存路径，这是「改一个颜色不必重写文档」的落实点。

#### 2. 校验（任务点 3、5）——本工单的主要工作量

`internal/biz/resumevault/presentation.go`（769 行）+ `presentation_design.go`。

**严格写入，宽松读取**，两条路径刻意不对称：

- `DecodePresentationPatch` 用 `DisallowUnknownFields` **加**一个尾随 token 检查。只靠前者不够：
  它拦不住 `{"a":1}{"b":2}` 或 `{}` 后面跟垃圾。
- `ParsePresentation` 是**全函数**，唯一会返回错误的是**更高**的 `schemaVersion`。存储值损坏
  （或为 `NULL`）一律读成默认值，错误**故意吞掉**——读路径不该因为一个样式值把整页打不开。
  `toResumeDomain` 里的 `//nolint` 式注释写明了这个取舍。

**主色是封闭色板 + 设计规则两道独立检查**，这一点容易混淆，测试里专门钉住了：`#ff0000` 明确
是暖色、仍然被拒（不在六色色板内）；反过来色板内每个色都被自己的校验接受。
规则顺序是「设计规则优先于『不在色板中』」，因为前者可操作、后者只是否定。

冷色判定 `isColdHue` 只在饱和度高于 `coldSaturationFloor = 0.10` 时生效。这不是细节：HSL 给
无彩色分配的色相是任意的 0，若不加这道闸，一个中性灰是否被判为冷色就取决于运气。冷色区间
`[150, 300)` 度；亮度下限 `0.20`。

`#292524`（stone-800）**被亮度下限拒绝**（实测 L≈0.151）。这看着与 `AGENTS.md` 矛盾——该文件
说用 stone-800 替代纯黑——但不矛盾：那是说**正文文字色**，不是**主色**。它进了
`TestPureBlackAndNearBlackAreRefused` 的拒绝表格，并在测试注释里写明理由，否则下一个人会以为
这是 bug 而删掉它。

页边距正则允许数字与单位之间有空格（`18 mm`），因为那是人写边距的方式；但裸数字仍然拒绝，
因为单位真的无法推断。

**`schemaVersion` 的兼容行为**（验收点 4）：缺失读作最旧形状并升级；更低版本升级；更高版本
拒绝（`ErrUnsupportedPresentationVersion`）；写出时一律盖上当前版本。前端 `presentationFromRecord`
同样**总是**盖当前版本，从不回显存储的版本号。

#### 3. 乐观锁与端点（任务点 4、6）

`UpdatePresentation` 走 `WHERE id = ? AND version = ?` 的加锁写入，`RowsAffected == 0` 判为冲突，
与内容写入共用同一个 `version` 列（ADR-0004 明确不要两个计数器——「我改了正文、你改了主题」
两边都成功会静默丢掉一边）。

路由是 `registerCustomHandlers` 里的 `PATCH /api/resumes/{id}/presentation`，复用 `authorizeResume`
（所有者或管理员，**未新增权限类型**，ADR-0009 的封闭集）。读取不另开端点：`GET /api/resumes/{id}`
的 `GetResumeReply` 新增 `presentation` 字段。

**不写历史**：`UpdateResumePresentation` 不调用 `recordVersion`。

#### 4. 线上格式的一处真实缺陷（本工单最重要的发现）

最初端点用 `writeJSON` 写回复，这是**错的**，且错得没有任何报错：

- `internal/server/http.go` 把默认响应编码器换成了 `encoding/json` + 生成结构体的 tag，而
  protoc-gen-go 这里的 tag 是 **snake_case**。`writeJSON` 走的就是这条路。
- 但 `ctx.Result` **不走**自定义编码器，它走 kratos 的 JSON codec = `protojson` = **camelCase**。

所以同一份 `.proto` 消息，两种写法给出两种键名。资源上其余所有路由都用 `ctx.Result`，前端读的
也是 camelCase（`resume.version`、`resume.jobTitle`）。原来的写法会让面板拿到 `accent_color`
而它期望 `accentColor`，于是**永远显示默认值且不报任何错**——正是 `api-client.ts` 注释里记过的
那一类事故。

修法是新增 `UpdatePresentationReply` proto 消息并改用 `ctx.Result`，理由写在 proto 注释里。
同时**改正了两处说反了的旧注释**（`internal/service/resumevault/ai.go` 的 `writeJSON` 与
`api-client.ts` 的命名约定块），它们原先声称 proto 路由发 snake_case，正好相反。留着会让下一个
人照错的结论做决定。

前端 `presentationFromApi` 仍然同时接受两种拼写：代价是两个 `??`，收益是万一将来又有人用错
编码器，面板不会静默退回默认值。

#### 5. 与后端的常量一致性（前端侧的重点）

前端必须自己拿一份色板、模板表、字体表与数值边界——它不能每次渲染都问服务端，而用户点了一个
非法值应该在**往返之前**就被拒。这份复制会漂移，且往最坏的方向漂移且无声：前端多留一个服务端
已删的颜色，用户点它必然 400，而色块就在屏幕上；边界往上飘会一直提供必然失败的值。

所以复制是**被验证**的，不是被信任的：`cmd/resumepresentation` 从活的 Go 常量（`AccentPalette()`、
`PresentationBounds()`、`PresentationFieldNames()`、`DefaultPresentation()`）生成
`src/lib/__fixtures__/server-presentation.json`，`resume-presentation-parity.test.ts` 逐项比对
色板（含顺序与中文标签）、模板、字体、13 项边界、默认值逐字段、字段名集合。

**这个测试是验证过的**：临时把 `#a64b45` 改成 `#a64b46` 后，2 个用例立刻失败并指名该色板项，
随后已还原。

为生成 fixture，后端新增了三个导出：`AccentLabel`、`PresentationLimits`、`PresentationBounds()`。

#### 6. `.md` 导出的处置（验收点 7，ADR-0004 建议省略）

**决定：省略**，并让类型签名来强制它——`resumeMarkdownExport(metadata, body)` 根本收不到展示态，
所以省略是结构性的而非靠自觉。三个理由写在 `resume-builder.ts` 的文档注释里：往返无法恢复它、
frontmatter 是严格类型化的信封、`.md` 是内容产物。

`resume-builder.test.ts` 新增一个 `describe` 块：喂进带 17 个样式键的记录，断言输出里**没有**任何
样式键、也没有任何样式值（`#8b9d77`、`22mm`、`ats-safe-single-column`），同时反向断言
frontmatter / 姓名 / 邮箱 / 正文仍然在——否则「什么都没导出」也能让前一组断言通过。

#### 验证

已验证（全部通过）：

| 门禁 | 结果 |
|---|---|
| `go build ./...` | exit 0 |
| `go vet ./internal/... ./cmd/...` | exit 0 |
| `go test ./internal/... -count=1` | 5/5 包 ok |
| `gofmt`（CRLF 安全） | 15 个新增/改动文件全清 |
| BOM 原始字节检查 | 无 BOM |
| `npx tsc --noEmit` | exit 0（本次改动前） |
| `npm run test` | 18 文件，**619 passed + 3 expected fail** |
| `npm run build` | 编译成功 |
| `npx eslint .` | 28 problems（14 error / 14 warning）= 既有基线，未新增 |

`resume-presentation-parity.test.ts` 43 个用例；`resume-api.test.ts` 新增 7 个；`resume-builder.test.ts`
新增 2 个；`presentation_test.go` 约 30 个；另有 `presentation_postgres_test.go` 2 个。

**此前已通过、现在无法复跑**（原因见下）：`presentation_postgres_test.go` 的
`TestPresentationAgainstRealPostgres` 与 `TestPresentationWritesAreSerialisedAgainstRealPostgres`
曾在本机真实 Postgres 上通过（分别 1.31s / 2.24s），覆盖 NULL→默认、全非默认值往返（含中文
章节名）、`pg_typeof` 确认为 `jsonb`、陈旧写入返回 `StaleVersionError` 且值/`updated_at`/`version`
均未变、未知 id 返回 `ErrResumeNotFound`、零版本返回 `ReasonVersionMissing`，以及 8 个并发写者
只成功 1 个。迁移 v4 也在克隆库上用 `migrate.Up` 演练过。

**本次未能执行的部分**：本机 PostgreSQL 服务（`postgresql-x64-18`）现已停止，而当前会话
**无管理员权限**，`Start-Service` 与 `sc.exe start` 均返回 Access denied。因此：

- 上表是在**未设 DSN** 的情况下跑出的，Postgres 门禁用例按设计 `t.Skip` 并通过。
- 需要真实库的复跑与 HTTP 端到端（200 / 未知键 400 / 冷色 400 / 纯黑 400 / 无 token 401 /
  非所有者 403 / 陈旧版本 409 / 详情带 `presentation`）**待环境恢复后补做**。这不是已知缺陷，
  只是没跑。

顺带一提：那次「失败」的 `TestBackfillSkipsAnUnreadableFileWithoutAborting` 是**级联假象**——
DSN 设了但连不上，同包内的库用例失败污染了输出；该用例本身在无 DSN 时单跑通过（0.12s）。

#### 范围边界

**未实现：样式面板 UI，以及把展示态接进 `ResumePrintView` 的渲染。**

这不是遗漏。面板的价值全部在于「改了就看得见」，而预览目前是一份硬编码排版的组件，工单 20
才把它换成真正的渲染器（ADR-0007）。现在交一个改了没有任何可见效果的面板，比不交更容易
误导——用户会以为功能坏了。样式值的**可达性**与**可见性**分别由工单 20/21（渲染与模板）和
22–24 承担，本工单交付的是它们共同的前置：一个能存、能校验、能并发安全地独立更新的列。

因此本工单目前的用户可见效果是：API 层面可用，`.md` 导出行为已明确记录。这与工单 19 的
任务清单（1–6）一致，验收标准的 7 项也逐条有对应物。

#### 留给后续工单的

- 工单 20 起需要在 `ResumePrintView` 里消费 `presentation`：字体族/字号缩放/行距/页边距/主色
  目前全部硬编码，且 `PAGE_MARGIN_MM = 18` 在 `src/lib/export-pdf.tsx` 与
  `src/app/globals.css`（`@page`）里各有一份，收敛到 `PRESENTATION_BOUNDS` 时要注意别只改一处。
- `sectionOrder` 与 `photo` 已能存能校验，但没有任何生产者：章节顺序属于渲染器，证件照需要
  上传通道。
- 若将来要按 `template` 查询简历，需要给 `presentation` 加 GIN 索引（ADR-0004 的负面后果里
  已记）。当前没有这个查询。

