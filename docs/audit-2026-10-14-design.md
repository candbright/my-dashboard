# ResumeVault 设计质量审计 — 前后端耦合 / 内聚 / 冗余 / 注释

- **日期**：2026-10-14
- **范围**：前端 [`D:\project-me\my-dashboard`](.)（可写）、后端 `D:\project-me\kratos-server`（**只读**）
- **约定**：本轮**未修改任何业务代码**；唯一写入是本报告。后端按约定只出报告。
- **判据**：低耦合、高内聚、冗余代码、干净整洁、**注释简短有用**。
- **与旧报告的关系**：[`docs/audit-2026-10-14-readonly.md`](./audit-2026-10-14-readonly.md) 已覆盖 a11y / 性能 / Bug，多数已由工单 44 sweep。本报告**不重复**其结论，只在其未覆盖的「设计形状」维度取证；重叠处标注「旧报告 §x，仍未修」。

## 0. 基线与方法

| 手段 | 结果 |
|---|---|
| `npx tsc --noEmit` | **exit 0**，零类型错误 |
| `npx vitest run` | 28 passed \| 1 skipped（文件）；**768 passed \| 3 expected fail \| 1 skipped**（用例）；9.95s |
| `npx eslint src` | 23 problems（13 errors / 10 warnings）—— 与工单 44 记录基线一致，无回归 |
| `go vet ./internal/... ./cmd/...` | clean |
| 自建导入图脚本 `.audit/graph.mjs` | 扇入/扇出、循环、跨层依赖 |
| 自建注释体量脚本 `.audit/comments.mjs` | 108 个非测试文件，注释/代码 = **0.34** |

> 两个 `.audit/*.mjs` 是一次性脚本，**审阅后可直接删除**。`go vet` 与类型检查均**干净**——下面所有条目都是设计问题，不是「代码坏了」。

### 证据标记

- **✓ 已复核**：我本人读过源码 / 跑过命令。
- **△ 下级报告**：由并行审计给出 `file:line`，我抽查了关键行但未逐行复核（下级报告的覆盖率自述见 §9）。

### 我驳回的一条下级结论（重要）

下级报告曾断言 `ResumeRecord`（snake_case）与后端实际返回（camelCase）不一致，会导致保存后元数据静默丢失。**此结论不成立，已从本报告剔除**：

- `internal/server/http.go:105-113` 把 kratos 的默认响应编码器**替换**成 `json.NewEncoder(w).Encode(v)`（`encoding/json`，非 protojson）；
- `v1.ResumeInfo` 的 Go tag 是 `json:"job_title,omitempty"`（`api/resumevault/v1/resume.pb.go`），因此 list / detail / create / update **全部**返回 snake_case；
- 前端 `ResumeRecord`（`src/lib/types.ts:10-58`）与之一致，无需归一化。

**但要保留的是它的成因**：前端有一段 14 行注释（`src/lib/api-client.ts:157-170`）专门论述这件事，而它**说的正好是反的**（它写着 `ctx.Result(...)` → protojson → camelCase，并说「Go 服务里曾有一条注释把这件事记反了」——于是它自己成了第二版记反的）。见 [C1](#c1--陈旧注释与代码相反最贵的一类)。

---

## 1. 优先级总表

`P0` = 正确性/安全，建议立刻；`P1` = 结构性，建议本轮；`P2` = 清洁度；`P3` = 可选。

| ID | 问题 | 位置 | 影响 | 量 |
|---|---|---|---|---|
| **P0** | | | | |
| [A1](#a1--patch-presentation-对每个真实请求都返回-400一个-wire-契约被两层各自严格解码-) | `PATCH .../presentation` 对**每个**真实请求返回 400 | `service/presentation.go:146` + `biz/presentation.go:218-228,416-433` | 展示态面板完全不可用 | S |
| [B1](#b1--验证码-_devcode-默认泄露fail-open-) | `_devCode` 默认下发：`ENV`/`GO_ENV` 全仓无人设置 | `service/user/auth.go:93` | 生产环境验证码随响应返回 | XS |
| [F1](#f1--账号密码经-url-查询串在-loginregister-之间传递-) | 密码进 URL 查询串 | `app/login/page.tsx:23,47`、`app/register/page.tsx:24,47` | 密码进历史/Referer/反代日志 | XS |
| [A2](#a2--sse-流被截断时报成完整答案一个恒真的守卫-) | SSE 流被截断 → 上报「完成」 | `biz/resumevault/ai_wire.go:229-233` | AI 输出静默截断 | XS |
| [F2](#f2--autosave-的永久失败分类在生产中不可达--) | 「永久失败 vs 可重试」恒为可重试；耗尽后指示器永远说「重试中」 | `lib/autosave-failure.ts:52-63`、`hooks/useResumeAutosave.ts:215-221` | 400/403/404 空转 5 次；用户被反复告知重试中 | S |
| [B2](#b2--setprovidercredential-是死代码且把密钥存到了另一个-provider-) | `SetProviderCredential` 死且把密钥存到**错误的 provider** | `biz/resumevault/ai.go:279-297` | 潜在密钥错配 | S |
| **P1** | | | | |
| [A3](#a3--前端的非权威解析器已经是领域内核因此永远无法退役-) | 前端「将退役」的解析器承担 4 件事，扇入 18 | `lib/resume-parser.ts` | ADR-0003 无法落地 | M |
| [A4](#a4--后端-aiservice-同时拥有-ai-与审批授权两个限界上下文-) | `AIService` 同时拥有 AI 与审批/授权；`ai.go` 1356 行杂物抽屉 | `service/resumevault/approval.go`、`ai.go` | 内聚错误 | M |
| [A5](#a5--同一路径注册两次正确性依赖注册顺序被遮蔽的-handler-看起来仍然活着-) | 路由按注册顺序遮蔽；被遮蔽的 proto handler 永不可达却像活的 | `service/resumevault/service.go:26-41` | 一句 reorder 静默恢复退役行为 | S |
| [A6](#a6--发布审批工作流住在-http-handler-里-) | 审批工作流整个住在 handler；biz 的审批模块被绕过 | `service/resumevault/resume.go:426-503` | 第二个调用方无法复用 | M |
| [A7](#a7--同一件事的-n-份实现前端错误体读取-) | 「读取失败响应里的 error」前端 3 份实现，文案不一致 | `http-json.ts`、`api-client.ts:210`、`resume-api.ts:424` | 同一 500 两种文案；曾造成真实 bug | S |
| [A8](#a8--同一件事的-n-份实现用户可见流程-) | `DashboardClient`≈`my/page`、`admin/ai`≈`settings/ai`、`login`≈`register`、3 份文件拖放、5 份「加载+重试」 | 多处 | 修一次要改两处；已发生 | M |
| [A9](#a9--前端两个巨型组件resumeeditor-1119-aiupload-1012-) | `ResumeEditor` 1119 行 6 职责、`AIUpload` 1012 行 8 职责 | `components/` | 编辑器最热路径每次渲染重解析全文 | M |
| [A10](#a10--owner-or-admin-写了-4-遍admin-判定-5-种写法可复用的那个签名不可复用-) | owner-or-admin ×4、admin 门禁 ×5，已抽出的 helper 没人用 | `service/resumevault/*` | 访问控制靠注释手工同步 | S |
| [A11](#a11--provider-crud-在-biz-与-service-各写两遍-) | Provider CRUD 在 biz ×2、service ×2（约 250 行） | `biz/resumevault/ai*.go`、`service/resumevault/ai.go` | 源码自己承认「只差 scope」 | M |
| [A12](#a12--元数据字段清单在-56-处跨语言且无跨语言守卫-) | 元数据字段清单 5–6 处，跨语言零守卫 | 前后端 | 加一个字段要改 6 处，失败静默 | M |
| [A13](#a13--lib-不是叶子层两个纯数据模块反向依赖-components-) | `lib/` 不是叶子层：2 处跨层边（1 处合法）+ 2 个真实环 | `lib/resume-starters.ts:44`、`components/ui/ConfirmModal.tsx:6` | 纯数据模块被迫拖进两个 `.tsx` 渲染器；barrel 自引用环靠求值顺序成立 | S |
| **P2** | | | | |
| [R1–R16](#3-冗余与死代码) | 死代码与重复实现（145 行死组件、5 个零引用导出、3 份 PDF 抽取、2 份脚本样板…） | 多处 | 认知负担 | S–M |
| [D1–D5](#5-文档与规范漂移) | AGENTS.md / README.md / 后端 AGENTS.md 漂移；设计规范只锁了 4 条 | 3 个文档 + 1 个 invariant | 文档教错人 | S–M |
| [C1–C3](#4-注释) | 注释/代码 = 0.34，36 个文件 ≥0.6；陈旧注释与代码相反 | 全仓 | 第三份会腐烂的决策记录 | L |
| [X1–X4](#6-跨仓一致性与守卫) | 跨仓魔法数字（bcrypt 12 ×4、限流 200 ×4、18mm ×5…）与缺失的 parity 守卫 | 前后端 | 无声漂移 | M |

---

## 2. 架构与耦合

### A1 — `PATCH .../presentation` 对每个真实请求都返回 400：一个 wire 契约被两层各自严格解码 ✓

> **已修复**（见 §7.0）。修法：让**一个**严格解码器吃掉整个写信封（`{...styling, version}`），而不是让两层各严格解码一半。修复时被新测试逼出一个细节：把 `Presentation` 嵌进信封结构体后，Go 的 `UnmarshalTypeError.Field` 变成 `Presentation.fontScale`，会把 Go 类型名泄进 400 文案，故 `fieldFromDecodeError` 增加 `trimEmbeddedStructName`。

> 这是本轮最重要的发现，同时是**功能缺陷**与**层次缺陷**，且已被执行复现。

- **契约**：`PATCH /api/resumes/{id}/presentation`（`service/resumevault/service.go:60` → `presentation.go:72 handleUpdatePresentation` → `:86 decodePresentationRequest`）。
- **前端总是发 `version`**：`src/lib/resume-presentation.ts:663-665`
  ```ts
  export function presentationWriteBody(write: PresentationWrite) {
    return { ...write.presentation, version: write.version };   // version 与样式字段平铺
  }
  ```
  经 `src/lib/resume-api.ts:392` `JSON.stringify(presentationWriteBody(write))` 发出。
- **服务端把整个 body 交给了不知道 `version` 的解码器**：`service/resumevault/presentation.go:146`
  ```go
  presentation, err := rvbiz.DecodePresentationPatch(raw)   // raw 含 version
  ```
  而 `biz/resumevault/presentation.go:424-433` 用 `dec.DisallowUnknownFields()` 解进 `Presentation`；`Presentation`（`biz/resumevault/presentation.go:218-228`）**恰好 9 个字段，没有 `version`**。
  → `unknown field "version"` → `:153-154` 返回 400 `INVALID_PRESENTATION`：`展示态字段 "version" 不合法：未知字段 "version"，请检查拼写`。
- **正确的写法就在旁边**：`service/resumevault/presentation.go` 已经声明
  ```go
  type presentationRequest struct {
      rvbiz.Presentation
      Version int64 `json:"version"`
  }
  ```
  并且注释 `:131-134` 写着「`decodePresentationRequest` 的职责只是 wire 信封」。但它没有用这个类型解码，而是手工拼装（`:176`）。
- **注释与代码互相矛盾**：`:159-161` 写着「严格性已经在上面做过一次——**不能做两次，否则 `version` 会被展示态解码器当成未知字段报出来（它不认识 version）**」。作者准确地写出了这个失败模式，却把它留在了第一次解码里。同一处理被前端复制：`resume-presentation.ts:656-661` 与 `resume-api.ts:376-382` 都断言「一个 `DisallowUnknownFields` 解码器按同一条规则拒绝拼错的样式键和拼错的 `version`」。
- **为什么测试没抓到**：唯一覆盖该解码器的用例 `biz/resumevault/presentation_test.go:38-53` **故意不带 `version`**；`presentationRequest` 的组装没有服务层用例；前端 `resume-presentation-parity.test.ts` 只比对常量。
- **执行复现**（下级报告，`go test -overlay` 探针打在真实 package 上，仓库未被写入）：
  ```
  DecodePresentationPatch(含 version) → presentation field "version": 未知字段 "version"，请检查拼写
  DecodePresentationPatch(不含 version) → <nil>
  ```
- **建议（S）**：用**一个**严格解码器解 `presentationRequest`（它已存在），删掉 `DecodePresentationPatch` 对整包的调用与第二次 `json.Unmarshal`；补一个「POST 前端真实 body」的服务层用例。

### A2 — SSE 流被截断时报成「完整答案」：一个恒真的守卫 ✓

> **已修复**（见 §7.0）。`scanner.Err()` 现在只在客户端自己断开（`ctx.Err() != nil`）时静默；其余返回 `STREAM_TRUNCATED` 且**不再** `emit(Done)`。下游无需改动：`service/ai.go` 早就有「已开始流 → 在流内发 `{"error"}`」的通道，前端 `sse.ts:89-90` 早就会消费它——缺的只是上游肯报错。

`biz/resumevault/ai_wire.go:229-233`：
```go
if err := scanner.Err(); err != nil && ctx.Err() != nil {
    return nil // client went away; not an error worth reporting
}
emit(StreamEvent{Done: true})
return nil
```
- **缺陷**：条件写反了效果。无论 `ctx` 是否取消，函数都 `emit(Done)` 并 `return nil`——差别只有那句注释。**真正的坏情况（`scanner.Err() != nil` 且 `ctx.Err() == nil`）**——4 MiB 扫描上限、传输中断——恰好落进「上报完成」的分支。
- **后果**：用户拿到半截简历/AI 输出，界面显示解析成功；下游 `assertPdfText` 之类断言无从察觉。
- **建议（XS）**：`if err := scanner.Err(); err != nil { if ctx.Err() != nil { return nil }; return err }`（或发一个 error 事件）。补一个「中途断流」用例。

### A3 — 前端的「非权威解析器」已经是领域内核，因此永远无法退役 ✓

- **结构证据**：扇入 **18**（`lib/resume-parser.ts`），仅次于 `cn.ts`(28) 与 `ui/index.ts`(29)。所有业务组件都依赖它。
- **内容证据**：该文件同时是 4 件事——(1) 领域类型（`ParsedResume`/`ResumeSection`/`ResumeSectionItem`/`SectionKind`/`MetadataColumn`）；(2) 非权威正文解析器；(3) 服务端快照适配层（`StructuredContent*`、`parsedFromStructuredContent`、`sectionKindFromWire`）；(4) 元数据归一化（`ParsedFrontmatter`/`ResumeMetadataView`/`resumeMetadataView`/`withMetadata`）。
- **类型级环**：`lib/resume-section.ts:1` `import type { ResumeSection, SectionKind } from './resume-parser'` ↔ `lib/resume-parser.ts:31` `import { classifySectionTitle } from './resume-section'`。`import type` 会被擦除，**运行时无环**；但两者在类型层面不可分离，因为共享词汇住在解析器里。
- **为什么是缺陷**：`AGENTS`/`CONTEXT.md` 与文件头 `resume-parser.ts:1-29` 都声明「本解析器不是权威、只在编辑器即时预览里存在、随服务端解析收敛而退役」。但 18 个模块 import 的是**它的类型**，所以真正的解析逻辑一行也删不掉——`ParsedResume` 这个「将退役的名字」是事实上的领域模型。ADR-0003 的意图在文件层面无法达成。
- **建议（M）**：把领域类型抽到叶子模块（`lib/resume-model.ts`，或并入既有 `lib/types.ts`）；`resume-parser.ts` 只剩 `parseResumeMarkdown`。**类型级环随之消失，退役变成一次删除而不是 18 处改动**。不违反 ADR-0003，是它的落地。

### A4 — 后端 `AIService` 同时拥有 AI 与审批/授权两个限界上下文 ✓

- `service/resumevault/approval.go` 的 6 个审批/授权 handler 全部是 **`*AIService`** 的方法：`handleListApprovals:70`、`handleDecideApproval:145`、`handleSubmitApproval:200`、`handleMyPermissions:260`、`handleGrantPermission:319`、`handleRevokePermission:355`。
- 装配处用 **`aiSvc`** 注册：`service/resumevault/service.go:101-106`。
- `service/resumevault/ai.go` **1356 行 / 39 个方法**，比任何 `biz/` 文件都大（`biz/resumevault/resume.go` 1263）；它同时是**杂物抽屉**：`writeJSON:154`、`requireAdmin:162`、`isoTime:1354`、`truncateRunes:1369` 这些通用工具住在这里，并被 `admin.go`、`approval.go`、`resume.go` 引用（例如 `approval.go:55` 用 `isoTime`）。
- **为什么是缺陷**：`AdminService` 已经存在，审批/授权却挂在 AI 服务上，于是**改审批要动 AI 文件**、**审批的 handler 依赖 AI 文件里的私有工具**。不是「文件太长」，是**一个类型有两个变化原因**。
- **建议（M）**：6 个 handler 迁到 `AdminService`（或新建 `ApprovalService`）；`writeJSON`/`requireAdmin`/`currentUser`/`isGuest`/`isoTime`/`truncateRunes` 抽到 `service/resumevault/http.go` 与 `text.go`。纯搬迁。

### A5 — 同一路径注册两次：正确性依赖「注册顺序」，被遮蔽的 handler 看起来仍然活着 ✓

`service/resumevault/service.go:26-41`——自研 handler **先**注册，proto 路由后注册，注释自述原因：

> 「gorilla/mux（Kratos 用它）**按注册顺序匹配**……**proto 路由先注册会遮蔽这里的替代实现并静默提供已退役行为——这正是顺序反了时真实发生过的事**。」

| 路径 | 生效 | 被遮蔽（永不可达） |
|---|---|---|
| `GET /api/resumes` | `service.go:53 resumeSvc.handleListResumes` | proto `ResumeService.ListResumes`（`service.go:38` 注册） |
| `GET/PUT /api/admin/users` | `service.go:111-112 adminSvc.handle*` | proto `AdminService.ListUsers`/`UpdateUserRole` |
| `GET/POST /api/admin/approvals[/{id}]` | `service.go:101-102 aiSvc.handle*` | proto `AdminService.ListPendingApprovals`/`HandleApproval` |

另有 **5 个「退役存根」**（可路由、永远报错）：`admin.go:34-42`、`admin.go:45-47`、`admin.go:90-99`、`ai.go:363-372`（2 个），全部 `kerr.BadRequest("ENDPOINT_RETIRED", …)`。
还存在**重复实现**：`service/resumevault/resume.go:46-51` 的注释说 `listResumes`「由 proto handler 与自定义 `GET /api/resumes` 共享，所以两者不可能不一致」，但 `handleListResumes`（`:97-140`）把 switch 与 limit 解析**重写了一遍**（`:100-104`、`:112-121`），`listResumes`（`:52-70`）只剩它那个不可达的调用者。

- **为什么是缺陷**：(a) 一个路径两个实现，**代码读起来两个都能工作**，且没有测试能发现遮蔽；(b) 触发条件是**语句顺序**，一句无关 reorder 就静默恢复退役行为（已发生过）；(c) 退役 handler 留在 `.proto` 与生成代码里，永久制造「API 表面」的假象。
- **建议（S）**：从 `.proto` 删除退役 RPC，并停止注册被遮蔽的 proto 路由；把「custom 先于 proto」升级为**断言测试**；修掉 `resume.go:46-51` 的假注释（或让自定义 handler 调用共享 resolver）。

### A6 — 发布审批工作流住在 HTTP handler 里 △

`service/resumevault/resume.go:426-503` `applyVisibility` 实现了：撤回（`:446`）、管理员直批（`:453-462`）、「已批准则跳过审核」（`:478-483`）、立案（`:485-491`）、立案失败的**回滚**（`:495`），并按**字符串**分支：`:496` `kerr.FromError(err).Reason == "ALREADY_PENDING"`（该 reason 由 `biz/approval/approval.go:335` 产生）。

- **为什么是缺陷**：这正是 `biz/approval` 存在的理由——`biz/resumevault/resume_approval.go:19-20` 写着「审批模块是唯一的写者」。第二个调用方（批量导入、MCP server，见 `metadata_validation.go:14`）无法复用；而 reason 字符串是跨层隐式契约（也见 [R17](#r17--靠字符串散文名与类名跨层传递正确性-)）。
- **建议（M）**：迁入 `ResumeUsecase` 或一个 `ApprovalWorkflow` usecase，签名 `(resumeID, visibility, actorID, isAdmin)`；用**具名错误**替代 reason 字符串比较。

### A7 — 同一件事的 N 份实现：前端错误体读取 ✓

| # | 位置 | 行为差异 |
|---|---|---|
| 1 | `lib/http-json.ts:65-85 readJsonBody` | 判别联合；**文案带状态码** `` `${fallback}（HTTP ${res.status}）` ``；校验 `error` 是 string |
| 2 | `lib/api-client.ts:210-217 readError`（私有） | `(data?.error as string) \|\| fallback` —— **未校验类型**；**不报状态码** |
| 3 | `lib/resume-api.ts:424-447 readFailureBody`（私有） | `res.text()` + `JSON.parse`；额外回传 json 供 409 冲突解析 |

- **尤其刺眼**：`http-json.ts:20-22` 写明「这两半必须一起修，所以放在一个函数里，而不是每个调用点各自推导一遍」；`http-json.ts:61-63` 把「缺失文案绝不能把已知失败变成未处理拒绝」写成契约。实际覆盖：`readJsonBody` 只有 **4 个**外部调用点，而 `api-client.ts` 的 **22 个**封装与 `resume-api.ts` 的 5 处**全部绕过它**。
- **已造成过真实 bug**：`resume-api.ts:134-137` 记录——「`Response` 是流：先调 `readVersionConflict` 再调另一个读错误的函数，第二个读到已消费的流，于是每条文案都静默退化成兜底值——**这是它曾经有过的 bug**，被一条断言服务端原文的测试抓到」。
- **用户可见的不一致**：同一后端错误，列表页显示「…（HTTP 500）」，设置页显示「获取配置失败」。
- **建议（S）**：在 `http-json.ts` 加原语 `readErrorEnvelope(res): Promise<{ json: unknown; message: string | null }>`，三份实现都表达为它 + 各自包装。未校验的 cast 同时被消灭。

### A8 — 同一件事的 N 份实现：用户可见流程 △

| 位置 | 重复内容 | 已造成的代价 |
|---|---|---|
| `components/DashboardClient.tsx:71-79 / 32-69 / 116-134` vs `app/my/page.tsx:93-101 / 47-91 / 175-195` | 过滤表达式、fetch effect、错误卡片**逐字相同**（`DashboardClient` 169 行里约 120 行是 `my/page.tsx` 的子集） | 工单 44 的「失败不能渲染成空」被**手改两遍** |
| `app/admin/ai/page.tsx:113-127,129-132,154-175,220-222` vs `app/settings/ai/page.tsx:138-152,154-157,190-210,321-323` | `openAdd`/`openEdit`/**逐字相同**、`updateProvider` payload 字面量、同一个 toast 模板串；状态集同为 7 个 | 同一修复落在其中一页就丢 |
| `app/login/page.tsx` vs `app/register/page.tsx` | `handleSendCode` 除 `type` 外相同、倒计时按钮、卡片头、`goTo*`、`isAuthenticated` 重定向 | send-code 流程要改两遍 |
| `components/FileUpload.tsx:97-138`、`ResumeStartScreen.tsx:352-383,415-446`、`AIUpload.tsx:527-561` | 三份拖放选择器；**只有第一份做扩展名校验** | 同一 affordance 三种行为 |
| `admin/ai/page.tsx:55-111`、`settings/ai/page.tsx:67-122`、`admin/users/page.tsx:62-94`、`my/page.tsx:39-91`、`DashboardClient.tsx:28-69`、`ResumeHistoryPanel.tsx:110-165` | 6 个页面 5 种「加载+loading+loadError+重试」写法 | 也解释了 10 个 `react-hooks/set-state-in-effect` |
| `ResumePageClient.tsx:283-286,320-325,371-375,544-546`（+`:514` 只更新 1 个字段） | 「写回服务端记录」的 4 字段块出现 4 次，**第 5 条路径已经漏改** | 自证：漂移已发生 |

- **建议（M）**：`useResumeListing(scope)`、`useProviderAdmin({scope})` + `<ProviderAdminSection>`、`useEmailCode(type)` + `<AuthCard>`、`<FileDropzone>`、`useAsyncResource(fetcher)` + `<LoadFailure>`、`applyServerRecord(data)`。
- **正面样本**：`ProviderList` 已经是「共享组件 + `mode` prop」的正确形状——CRUD 那一半没跟上。

### A9 — 前端两个巨型组件：`ResumeEditor` 1119 行、`AIUpload` 1012 行 △

- **`ResumeEditor.tsx`**：(1) markdown⇄可编辑模型 + 重置协议；(2) **11 个 `setSections` 变更器**（`:260-430`，其中 `:260-264` 与 `:266-270` 只差一个 key）；(3) AI 聊天接线；(4) 12 个 props 的元数据透传；(5) 顶栏/底栏外壳 + 5 个可定制文案；(6) `Reorder` 拖拽 + 键盘重排 + live region。
  **热路径缺陷**：`:168` `const { frontmatter: initFm, sections: initSections } = parsedToEditable(parsed);` 在**每次渲染**执行，结果只被 `useState(...)`（`:169-174`）消费——**每次按键都重解析整篇文档然后扔掉**。修法一行：`useState(() => parsedToEditable(parsed))`。
- **`AIUpload.tsx`**：拖放/粘贴输入、SSE 流式解析、会话草稿持久化、预览+源码编辑器、AI 聊天、带 LCS diff 的版本历史、保存、`configured` 门禁。
  **重复**：解析请求与 builder 逐字重复（`AIUpload.tsx:215-237` vs `ResumeBuilderPage.tsx:81-101`，同一个 `90_000`）、保存重复（`:416-419` vs `:134-140`）、聊天重复（`AIUpload.tsx:317` vs `AISectionChat.tsx:171`）。
  另：`computeLineDiff:48-70` 是纯 O(m·n) DP，却住在 `.tsx` 里、且在渲染路径中被调用——按本仓自己的约定（`ats-analyse.ts` 的抽取先例）应移到 `lib/`。
- **建议（M）**：`useEditableResume` + `updateSection/updateItem` 两个变更器（或 `useReducer`）；`useAIParse()`/`useResumeSave()`/`<ChatPanel>`/`lib/line-diff.ts`；`EditorShell` 与 `SectionCard` 拆出。

### A10 — owner-or-admin 写了 4 遍、admin 判定 5 种写法，可复用的那个签名不可复用 ✓+△

- `service/resumevault/history.go:31-35` 的 `authorizeResume` 注释自述「这就是编辑/删除路径内联用的同一个 owner-or-admin 判定；这里抽出来是因为三个 handler 需要它」——**而那三处内联副本仍在**：`resume.go:191-195`、`:275-279`、`:550-554`。
- `requireAdmin`（`ai.go:161-168`）接收 `kratoshttp.Context`，于是**两个 proto handler 物理上无法调用它**（`admin.go:50,68` 拿的是 `context.Context`），只能在 `admin.go:51-53,69-71,159-161,187-189` 再抄 4 遍；另有 `isAdmin := role == "admin"` 的即席写法在 `ai.go:270-271`、`:1069-1070`。
- 类似地 `requireNonGuest`（`ai.go:728-738`）存在，但 `:1252-1254`、`:1301-1303`、`:1340-1342` 又内联了 3 遍。
- **为什么是缺陷**：访问控制策略被复制在传输层，靠注释手工同步；**新加一个编辑端点可以静默漏掉它**。
- **建议（S）**：把门禁声明在 `context.Context` 上并让 6 处都调用；审批/删除/编辑路径统一走 `authorizeResume`。

### A11 — Provider CRUD 在 biz 与 service 各写两遍 △

- `biz/resumevault/ai.go:117/143/178`（全局）vs `ai_user_providers.go:195/218/249`（个人）——除 loader/saver 外相同。
- `service/resumevault/ai.go:754/774/798` vs `:838/858/882`——**源码自己承认**（`service/resumevault/ai.go:723-726`）「**只**在 scope 上不同」。
- 约 250 行重复。**建议（M）**：一个以 `scope` 为参数的实现 + loader/saver 注入。

### A12 — 元数据字段清单在 5–6 处、跨语言且无跨语言守卫 ✓+△

| 侧 | 位置 |
|---|---|
| Go | `biz/resumevault/resume.go:1053 metadataFieldOrder`、`data/resumevault/resume.go:223 metadataColumns`、`data/resumevault/model.go:16-25 ResumeModel`、`data/resumevault/metadata_backfill.go:125,142,168,81`（且 `:116` 的注释写着「在一处」） |
| TS | `lib/resume-metadata.ts:37 MetadataKey` / `:80 METADATA_FIELDS`、`lib/resume-parser.ts:223 METADATA_COLUMNS`、`lib/types.ts:10-58 ResumeRecord` |

- **唯一守卫是 Go 内部的**：`data/resumevault/metadata_columns_test.go:24` 与 `:85`。**前端测试套件没有任何一处提到服务端的字段清单。**
- **漂移已经发生**：`METADATA_COLUMNS`（9 列，无 `summary`）vs `MetadataKey`（10，含 `summary`）——**无人测试**。
- **这个漂移的后果有记录**：工单 18 的实施记录写着 `parsed.frontmatter` 变成永久为空，「预览 + 四种导出…全部静默丢元数据」；`lib/resume-metadata.ts:10-13` 也把同一危险写了一遍（「第二份调和就是某个字段静默停止保存的方式」）。
- **建议（M）**：让 `cmd/resumepresentation`（或新的 `cmd/resumefacts`）一并输出 `MetadataFieldOrder()` 与 `ResumeModel` 列清单，在 `lib/resume-metadata.test.ts` 断言 `METADATA_KEYS` 与之一致、`METADATA_COLUMNS` 与之一致、每个 `MetadataKey` 都出现在 `ResumeRecord`。**复用既有 guard 模式，不新建机制**。

### A13 — `lib/` 不是叶子层；2 个真实环 ✓

- **跨层边（全部就这两条）**：`lib/resume-starters.ts:44` → `@/components/resume-render`（拖进两个 `.tsx` 渲染器）；`lib/export-pdf.tsx:19` → `components/ResumePrintView.tsx`。
  **后者是故意的**（`export-pdf.tsx` 是 `'use client'` 的打印编排器，ADR-0001/0007），**不计入**。
  前者不是：`RESUME_TEMPLATES`/`DEFAULT_RESUME_TEMPLATE`（声明在 `components/resume-render/index.ts:29,32`）**是数据不是标记**，而 `lib/resume-template.ts` 已经拥有 `ResumeTemplate` 类型与 facets 词汇表。
- **环 1（运行时）**：`components/ui/ConfirmModal.tsx:6` `import { Button } from '@/components/ui'` ↔ `components/ui/index.ts:22` `export { ConfirmModal } from './ConfirmModal'`。
- **环 2（仅类型）**：见 [A3](#a3--前端的非权威解析器已经是领域内核因此永远无法退役-)。
- **建议（S）**：模板注册表移入 `lib/resume-template.ts` 并由 `resume-render/index.ts` 反向 re-export；`ConfirmModal` 改相对深路径 import（成员文件本就不该 import barrel——生产代码里另外 2 处违反导入约定：`ResumeBuilderPage.tsx:11`、`UploadPageClient.tsx:9`）。

---

## 3. 冗余与死代码

### 3.1 重复实现

#### R1 — 零填充两份、两种写法 ✓
`lib/autosave-indicator.ts:30-32`（`value < 10 ? \`0${value}\` : String(value)`）vs `lib/version-conflict.ts:159`（`String(n).padStart(2,'0')`）——同目录、同职责、负数/三位数行为不一致。第三份在 `components/ResumeHistoryPanel.tsx:69`。**建议（S）**：一个 `lib/clock.ts`（`pad2`/`formatClockTime`/`formatDateTime`）。

#### R2 — 同一个类型两个名字：`PresentationTokens` 与 `PresentationDefaults` ✓
`lib/resume-template.ts:68-74` 定义 `PresentableFields = Pick<ResumePresentation, 7 个成员>` 与 `PresentationTokens = Partial<PresentableFields>`；`lib/resume-presentation.ts:215-220` 用**逐字重复的同样 7 个成员**重新推导 `PresentationDefaults`。`resume-template.ts:64-67` 特意写明「用 `Pick` 而不是手写清单，这样不会与 `ResumePresentation` 漂移」——而隔壁正是手写清单。加第 8 个字段时一处能编译、另一处静默不生效（ADR-0008 实施记录里写过的「死 token」故障）。**建议（S）**：`PresentationDefaults = PresentationTokens`。

#### R3 — 两个浏览器验收脚本各实现一遍 `printAndExtract`，且 Chromium 启动样板重复 ✓
`scripts/verify-print-export.mjs:269-301` vs `scripts/verify-template-browser.mjs:161-177` —— **同名同职责两份实现**。差异正是危险处：前者多做 `page.emulateMedia({media:'print'})` 与「`.no-print` 是否真被隐藏」的探测，后者**没有**；两者都缺 `try/finally`。启动样板也重复（`:41`/`:41`、`:351-352`/`:184-188`），而「**必须用完整 Chromium 而非 headless shell，否则 CJK 全变空格**」这条只写在其中一个的注释里。
另：`verify-print-export.mjs:304-315 pageTexts` 又直接 `import('pdfjs-dist/…')` 自己按页抽字，而同一脚本 `:31` 已 import 共享的 `extractPdfText`（`lib/pdf-assert.ts:263`）——**一个脚本里两条 PDF 抽取路径**。AGENTS.md 把这两个脚本当门禁，重复意味着「打印路径修好了」只证明其中一个过。**建议（S-M）**：抽 `scripts/lib/chromium.mjs`。

#### R4 — `ProviderFormModal` 把同一个表单写了两遍（约 90 行） ✓
高级/编辑分支 `components/ai/ProviderFormModal.tsx:482-518` vs 新增分支 `:522-573`：都渲染「显示名称/提供商 ID/API 地址/接口协议 Select/modelEditor/密钥申请地址」，只有 `disabled`/`placeholder`/`description`/`onChange` 不同；`protocols.length > 0 ? … : AI_PROTOCOLS.map(…)` 这 3 行**逐字复制**在 `:505-507` 与 `:555-557`。顺带 `:482` 用了 `border-l-2`（见 [D4](#d4--设计规范不变式只锁了-4-条规则其余-60-处违规-)）。**建议（S）**：字段描述数组 + 一次 map，`protocolOptions` 提 `useMemo`。另：13 个状态由 effect 重置（`:142`，ESLint `set-state-in-effect`）——把表单子树 `key={editing?.id ?? 'new'}` 可同时删掉 effect 与陈旧帧闪烁。

#### R5 — PDF 抽取结果字段表写了两遍 ✓
`lib/pdf-assert.ts:26-56 PdfTextStats`（8 字段）vs `lib/ats-report.ts:71-80 AtsExtractedText`（同样 6 字段），`ats-report.ts:110` 起逐字段搬运。**建议（S）**：`PdfTextStats extends AtsExtractedText { ok; reason? }`，桥接消失。

#### R6 — `exportResumePdf`/`ExportResumeImage` 重复离屏挂载骨架 ✓
`lib/export-pdf.tsx:335-349` 与 `:351-397`：都构造 `position:fixed; left:-10000px` 容器、`createRoot`、动态 import、卸载，约 20 行只差最后调用的产出函数。**建议（S）**：`withOffscreenMount(node, fn)`。

#### R7 — `normaliseLineEndings` 导出了却没被复用 ✓
`lib/resume-text.ts:96` 导出，而 `lib/resume-parser.ts:521` 又内联 `content.replace(/\r\n/g,'\n').replace(/\r/g,'\n')`。**建议（S）**：调用它。

#### R8 — `downloadBlob` 存在却被绕过 △
`lib/export-pdf.tsx:411-419 downloadBlob` vs 手写 `URL.createObjectURL` 的两处：`components/ResumeBuilderPage.tsx:156-169`、`components/ResumeSourceView.tsx:41-49`（**两份已经不一样**：后者少 `appendChild/removeChild`）。正确用法见 `ResumePageClient.tsx:25,489`。复制按钮同样两份（`ResumeSourceView.tsx:35-39`、`UploadPageClient.tsx:58-62`）。**建议（S）**：import `downloadBlob`；加 `useCopyToClipboard`。

#### R9 — `ats-safe` 绕过 `contact.ts` 重实现联系方式格式化，且 PDF 与预览不一致 △
`components/resume-render/contact.ts:1-28` 明确是共享所有者（自述「`ResumePrintView` 与 `ResumeDisplay` 各带一份逐字相同的副本——**那才是最危险的重复**」），但 `resume-render/ats-safe.tsx:118-159` 绕过它自建 `parts.join(' · ')` 与第二个 `shortHandle`。后果：`contact.ts:71-78` 把 Website 缩成主机名而 `ats-safe.tsx:130` 打印完整 URL；`contactEntries` 给 GitHub 显示名 `liming` 而 ats-safe 打印 `github.com/liming`。`ats-safe.tsx:115-116` 的注释说「`138-0000-0000` 单独出现是有歧义的」——但代码推的是裸值。**建议（S）**：`ContactLine` 消费 `contactEntries(...)`；顺手修注释。

#### R10 — `classic` 与 `ats-safe` 各走一遍文档遍历 △
`resume-render/ats-safe.tsx:63-105` vs `classic.tsx:60-96` 是同一个五步骨架（`buildTheme`/`resolvePhoto`/`name || fallbackTitle`、`ResumePage→ResumeHeader→…→ResumeSectionList`、同样的 `isSkillsSection ? <SkillRow/> : <ResumeEntryList>` 分支）。**真正不同的部分**（`ClassicEntry` vs `ResumeEntry`、照片位置）是 ADR-0008 认可的刻意差异，**不要统一**。**建议（M）**：只抽 `renderSectionBody(section, theme, {Entry, SkillRow})`。

### 3.2 死代码（零引用，已跨 `src/` + `scripts/` grep 确认）

| ID | 位置 | 体量 | 说明 |
|---|---|---|---|
| R11 | `components/UploadPageClient.tsx:54 UploadPageClient` | **145 行** | 全仓零引用（`app/upload/page.tsx:4,9` 渲染 `CreatePageClient`）。更糟：它内部带着 `TEMPLATE_EXAMPLE`（`:11-52`），是**非测试 `src/` 里最后一处 YAML frontmatter 样例**，与 ADR-0003/`CONTEXT.md`「简历文档中不再包含 YAML frontmatter」直接矛盾，且嵌了第三方跟踪 URL `i.pravatar.cc` |
| R12 | `lib/version-conflict.ts:94 readVersionConflict` | — | 只有自己的测试引用。它是 [A7](#a7--同一件事的-n-份实现前端错误体读取-) 的**成因** |
| R13 | `lib/resume-starters.ts:205 findStarter` | — | 零引用（含测试与脚本）；邻居 `starterSeed`/`starterTemplate` 都有真实消费者 |
| R14 | `lib/resume-template-theme.ts:175 contentBoxFor` | — | 只有测试用；函数体是 `print-resume.ts:176 a4ContentBox` 的同义重写。注释 `:171` 声称「省得调用方 import 两个地方」，而唯一调用方本来就 import 了 |
| R15 | `lib/pdf-fixtures.ts:17 PNG_1X1`、`:29 bytesToBase64` | — | 只在同文件 `:120` 用；模块头 `:10-13` 声称的存在理由是「让测试**和** `scripts/verify-ats-report.mjs` 共享夹具」——共享那一半没发生 |
| R16 | `hooks/useResumeAutosave.ts:86,88 onSaved`/`onError`；`lib/sse.ts:37 signal` | — | 见 [F2](#f2--autosave-的永久失败分类在生产中不可达--) 与 [F3](#f3--sse-的-signal-是-no-op接口在撒谎-) |
| R16b | `components/CreatePageClient.tsx` | 16 行 | 纯中转：`app/upload/page.tsx` → `CreatePageClient` → `ResumeBuilderPage`；文件头 9 行「⚠️ Deprecated」既无工单号也无删除条件 |
| R16c | `components/ui/index.ts:13 CardFooter` | — | 唯一「barrel 导出但全仓零渲染」的成员（`CardHeader` 1 次、`CardBody` 6 次、`CardFooter` **0** 次） |
| R16d | 组件 props 无供应方 △ | — | `ProviderList.tsx:47 action`/`:50 renderStatus`/`:17 loading`（两个使用页都不传）；`AtsPreview.tsx:73,75 initialFileReport`/`initialFileName`（唯一调用点只传 `source`）；`ui/Input.tsx:19 labelPlacement='inside'`（**组件没有 inside 渲染路径**，且无人传） |

**旧报告结论已过期**：旧报告 §5.2 断言「导出的顶层函数没有任何一个零引用」。现在有 5 个，且其中 3 个的注释**声称自己有消费者**。

#### R17 — 「靠字符串/散文/类名跨层传递正确性」△
1. `resume-api.ts:134-137` 的整段论证建立在一个 `src/` 里**从未被调用**的函数上（R12）。
2. `lib/resume-presentation.ts:704-717 parsePresentationError` **解析 Go 侧中文措辞**（`const marker = '展示态字段 '` / `indexOf('不合法：')`），由 `resume-api.test.ts:608-617` 钉住。任何一次措辞调整都会让「标红出错控件」静默失效。
3. `hooks/useResumeAutosave.ts:371-374 isConflictError` 靠 `candidate.name === 'ResumeConflictError'` 鸭子类型（为绕开循环 import），注释诚实写了代价；风险是「一次改名 → 冲突被当成可重试 → 对着永远打不开的锁空转」。
4. 后端同类：`service/resumevault/resume.go:496` 比较 reason 字符串 `"ALREADY_PENDING"`；`biz/resumevault/ai_registry.go:1118-1120 IsNotConfigured` 比较 `"AI_NOT_CONFIGURED"`。
- **建议（M）**：错误走**具名/机器可读**标识（冲突已有 `VERSION_MISMATCH`/`VERSION_MISSING` 这类 reason，`version-conflict.ts:69` 在消费，先例存在）；`ResumeConflictError` 加稳定标记属性或类型守卫。

#### R18 — 后端死代码与假注释 △
- `data/resumevault/resume.go:112-129 writableColumns` 死，且注释「`Update` 写入的列」是**假的**——`Update` 走 `contentUpdatesMap`（`:153-158`），只写 filename/updated_at。
- `biz/resumevault/ai.go:279-297 SetProviderCredential` 死，且**把密钥存到另一个 provider**（经 `SetGlobalAPIAppKey` 存到*当前活跃* provider，然后切换活跃 provider），与自己的 doc 相反。
- 回填时代的死 API + 假注释：`biz/approval/approval.go:573 UpdateRequest`、`:584 RecordGrant`、`:666 PendingForResource`、`approval_backfill.go:53 ApprovalMigrationMarker`——真正的回填（`data/resumevault/approval_migration.go:42-54`）从不调用它们。
- 另有 `presentation.go:812 SortedSectionOrder`（注释理由是本仓不存在的 render service）、`ai_registry.go:85 IsModelEnabled`、`:217 CatalogEntry`、`:205 DefaultProviderID`（注释声称的 fallback 无代码实现）、`resume_approval.go:39 ResumeApprovalStatus`、`ai_crypto.go:133 IsEncryptedAPIKey`、`service/resumevault/ai.go:414 _ = userRole`、`:453 _ = user`。

### 3.3 「看着活着、实际走不到」

#### F2 — autosave 的「永久失败」分类在生产中不可达 ✓

> **已修复**（见 §7.0）。`api-client.ts` 新增带 `status` 的 `ApiError`，`resume-api.ts` **全部 7 处**非 2xx 抛出点（不止本行点名的 3 处）统一改抛它；`errorStatus` 收窄到这一真实契约，那段说反的注释一并改正。新增的回归测试**穿过真实 `saveResume`**，因为旧测试用「手工构造 `{status:500}`」恰好绕过了真正的缺口——本行末尾那句「测试通过 ≠ 功能存在」现在有了对应的守卫。

- `lib/autosave-failure.ts:52-63 errorStatus` 从**抛出的 error 对象**上找 `.status`/`.statusCode`/`.response.status`。**全仓没有任何一处**把状态码挂到 error 上：`apiFetch`（`api-client.ts:87-114`）对任何状态码都**返回 Response、从不抛**；`resume-api.ts:147,155,207` 抛的是不带状态的 `new Error(failure.message ?? '保存失败')`。
- **后果**：`classifyFailure`（`:77`）恒返回 `'retryable'`。`RETRYABLE_STATUSES`（`:35`）、`isServerError`（`:38`）、`return 'permanent'`（`:82`）、`autosave-machine.ts:181-182` 的 `case 'permanent'` **在生产中不可达**；400/403/404/422 的保存会被重试 **5 次 / 退避 2→30 秒**（`MAX_AUTOSAVE_RETRIES:108`、`retryDelay:93`）才告诉用户。
- **注释自证**：`autosave-failure.ts:10-12` 把这个行为列为要避免的——「永久失败……重试只会烧请求、推迟真相，并把它藏在一个永不了结的『保存失败，重试中』后面」。而 `autosave-failure.test.ts:63-85` 用**手工构造的 `{status:500}`** 让该分支在测试里全绿：**测试通过 ≠ 功能存在**。
- **建议（S）**：在读取边界挂上状态（`resume-api.ts` 手上就有 `res.status`），或让 `save` 返回判别结果而不是靠异常形状；顺手改掉 `:45-47` 那段与传输层不符的注释（它说 `apiFetch` 对 HTTP 失败会抛 `Error`——**这是错的**）。

#### F2b — 重试预算耗尽后指示器永远显示「保存失败，重试中…」，且无人被告知 ✓

> **已修复**（见 §7.0）。修法比原建议（「清零 `retries`」）更干净：新增纯函数 `reportedFailureKind`，把「预算耗尽」当成**分类**的一部分——上报为 `permanent`，于是 `status` 变 `failed`，`retrying` 自然为假，指示器渲染成可点的 danger 态「保存失败：<原因>」而不是不可点的「重试中」。同时补上 `onError`；并顺带修掉一个相邻缺陷：autosave 抢锁失败时**从不到达**冲突提示（`autosavePersist` 不设 `setConflict`），只留一个必然再撞同一把锁的「重试」按钮——现在走与其他写路径相同的冲突提示 + 重新载入流程。

`useResumeAutosave.ts:215-221` 耗尽时**只调 `onError?.(err)` 就 return，不再 dispatch**；`onError` 无人传入（R16）→ `ResumePageClient` 永远不知道失败、不弹 toast。同时 `useResumeAutosave.ts:354 retrying = status==='pending' && retries>0`，而 `autosave-machine.ts:187-193` 耗尽时**不清零 `retries`** → `retrying` 长期为真 → `autosave-indicator.ts:61-72` 渲染 warn 色「保存失败，重试中…」且 `actionable:false`。
**用户被告知「正在重试」而没有任何重试被排期**——正是 `autosave-indicator.ts:4-7` 声称该模块存在就是为了防止的那类谎言。**建议（S，约 3 行 + 1 个 prop）**。

#### F3 — `sse.ts` 的 `signal` 是 no-op：接口在撒谎 ✓
`lib/sse.ts:37` 声明 `signal?: AbortSignal`（注释「Optional external cancellation」），`:66` 解构，**只在 `:155-157` 的 `finally` 里读一次**；`:120-146` 的读循环既不检查 `signal.aborted` 也不注册 abort 监听。数据流动期间它**取消不了任何东西**。`sse.ts` 又完全没有测试（旧报告 §6-T2）。**建议（S）**：要么真正接线，要么删掉这个选项。

#### F4 — 「AI 智能解析」按钮在粘贴文本时静默绕过 AI △

> **已修复**（见 §7.0）。`onClick={onStartAI}`——与建议一致，只留一个 handler。原建议说「删掉不可达分支」，实际相反：`handleStartAI` 的 `else if` 分支是**唯一正确**的那个，不可达的是「`onStartWithText` 这条路」；把它删掉之后 `onStartWithText` 全链（组件 props → `UploadExpanded` props → `handleStartWithText` → `ResumeBuilderPage.handleStartWithText`）都成了死代码，一并删除，以免有人再「复用」出同一个 bug。

`components/ResumeStartScreen.tsx:471-475` 的按钮 `onClick={selectedFile ? onStartAI : onStartWithText}`，而同一组件 `:83-89 handleStartAI` 里有一个 `else if (pastedText.trim()) { onStartAI(pastedText.trim()) }` 分支——**不可达**。于是标着「AI 智能解析」的按钮在粘贴路径上执行的是本地 `parseResumeMarkdown`（`ResumeBuilderPage.tsx:42-47`），用户拿到更差的结果且没有任何提示。**建议（S）**：一个 handler（`onStartAI({file?, text?})`），删掉不可达分支。

### 3.4 跨仓魔法数字（无 parity 守卫）△

| 概念 | 副本 |
|---|---|
| bcrypt cost 12 | Go ×4 |
| API key 最短 10 | ×3 |
| 密码最短 6 | 后端 + 前端 `app/settings/page.tsx:135` |
| 列表 limit 200 | `biz/resumevault/resume.go:188`、`biz/approval/approval.go:488`、前端 `list-limit.ts:23,26`（旧报告 H7 手抄，**仍未修**）|
| token TTL | Go ×3 + 前端 `api-client.ts:46,71` |
| 重发验证码 60s | ×2 |
| `18mm` 页边距 | **5 处全在前端**：`lib/export-pdf.tsx:35`、`lib/print-resume.ts:41`、`app/globals.css:343`、`lib/resume-template-theme.ts:151`、`lib/resume-presentation.ts:130`——工单 19 的交接记录（`.scratch/…/19-presentation-state-jsonb.md:222-223`）点名过，仍开着 |

**建议（M）**：`list-limit.ts` 的两个常量已由响应体承载（`service/resumevault/resume.go:138`、`approval.go:132`），所以它是「死兜底」而非风险源，但应改为**从响应读取**、仅保留字面量作最后兜底；`18mm` 应从 `PRESENTATION_BOUNDS`/`DEFAULT_PRESENTATION.pageMargin` 派生，并用 `invariants/` 断言 `src/` 里不再有裸 `18mm`。

### 3.5 安全默认值与凭据传递

> 补记：B1/B2/F1 原本只在 §1 总表里出现，正文没有对应小节，总表里的锚点是**断的**。此节补齐，并记录修复状态。

#### B1 — 验证码 `_devCode` 默认泄露（fail-open）✓

`service/user/auth.go:93` 用 `os.Getenv("ENV") != "production" && os.Getenv("GO_ENV") != "production"` 判定 dev 模式。全仓（含 `Dockerfile`、`Makefile`、`configs/`、`README`）**没有任何一处**设置 `ENV` 或 `GO_ENV`，所以判定恒为真：`SendCodeReply._devCode` 会把验证码随响应返回——**任何能说出邮箱地址的人都能登录该账号，含管理员**。判据的缺省方向是错的：它把「没有配置」当成「开发环境」。

**已修复**：改为配置驱动且**缺省关闭**。`AppConf.DevCodes`（`app.dev_codes`）→ `wireApp(..., devCodes, ...)` → `NewAuthService(..., devCodes, ...)`，`SendCode` 读该字段；`configs/config.yaml` 显式打开（它是本地开发配置，生产挂载自己的 `/data/conf`，见 `Dockerfile:24`），并在启动时 `l.Warn` 一次，避免「开着却没人知道」。`kratos-server/AGENTS.md:260` 的旧规则同步改正。

#### B2 — `SetProviderCredential` 是死代码，且把密钥存到了另一个 provider ✓

`biz/resumevault/ai.go:279-297` 全仓零引用（唯一命中是它自己的定义）。它的实现是：先 `SetGlobalAPIAppKey`（把密钥记到**当前活跃** provider 名下），再 `SetGlobalActiveProvider(providerID)`（切到目标 provider）——于是密钥留在旧 provider 上，新 provider 无密钥。而它的 doc 恰好承诺相反的事（「可以为多个 provider 预先存好凭据再切换」）。

这不是设计分歧，是**被取代的旧实现**：`ai_registry.go` 的 `SetGlobalCredential`（按 provider id 归档，不要求活跃）才是正确版本，`ai_types` 里的 `aiGlobalSecrets` 注释明确写了「Earlier there was a single key in the global record, so changing the active provider kept the previous provider's credential」——即这个 bug 已经修过，而 `SetProviderCredential` 是修之前的残留。`service/resumevault/ai.go:711,714` 调的是 `SetGlobalCredential`，`ai_registry_test.go:604`（`TestSetGlobalCredentialTargetsAnyProvider`）钉住了正确行为。

**已修复**：删除。留着的风险是有人「复用」它、再次引入密钥错配。

#### F1 — 账号密码经 URL 查询串在 login/register 之间传递 ✓

`app/login/page.tsx:47` 与 `app/register/page.tsx:47` 的 `goTo*` 会把当前输入的**密码**写进 `router.push` 的查询串（`params.set('password', password)`），对端再从 `searchParams.get('password')` 读回填进表单（`login:23`、`register:24`）。查询串会进入浏览器历史、反向代理访问日志、以及本页后续请求的 `Referer`——密码离开了表单，活在该页面控制不了的地方。

**已修复**：两处 `goTo*` 只带 `email`，初始化不再读 `password`；顺带把同页重复读取查询串的两处（惰性初始化 + `useEffect`）收敛到一个 `emailParam` 源。

---

## 4. 注释

### 4.1 量化基线 ✓

108 个非测试文件（`src/**`，排除 `*.test.*`）：总行 23335、代码 15961、注释 **5450**、**注释/代码 = 0.34**；**36 个文件 ≥ 0.6**。

| 文件 | 注释 | 代码 | 比 |
|---|---|---|---|
| `hooks/usePrefersReducedMotion.ts` | 28 | **5** | 5.60 |
| `lib/markdown-sanitize.ts` | 68 | 13 | 5.23 |
| `components/resume-render/index.ts` | 24 | **5** | 4.80 |
| `lib/http-json.ts` | 56 | 25 | 2.24 |
| `lib/resume-presentation.ts` | 317 | 362 | 0.88（模块头 **49 行**） |
| `lib/resume-template.ts` | 229 | 150 | 1.53（模块头 **43 行**） |
| `components/ResumePrintView.tsx` | 50 | 80 | 0.62 |

**结论**：本仓库的注释不是「太少」，而是**默认写成了一篇决策记录**。信息多数是真的且有用，问题在**位置**——同样的论证已经写在 `.scratch/resume-platform/issues/*.md` 与 `docs/adr/*.md` 里（代码注释也频繁引用工单号），代码里的长散文是**第三份副本**，而副本会腐烂。

### C1 — 陈旧注释与代码相反（最贵的一类）✓

| 位置 | 注释说的 | 代码做的 |
|---|---|---|
| `lib/api-client.ts:157-170` | `ctx.Result(...)` → protojson → **camelCase**；并声称「Go 服务里曾有注释把这件事记反了」 | `server/http.go:105-113` 把响应编码器替换成 `encoding/json`，**全站 snake_case**。这段 14 行注释本身成了第二版记反的（正确结论见 §0） |
| `lib/autosave-failure.ts:45-47` | 「`apiFetch` 对 HTTP 失败抛 `Error`……两者按契约都不带状态码」 | `apiFetch` 对 HTTP 失败**返回 Response、不抛**（`api-client.ts:87-114`）。这个错误前提正是 [F2](#f2--autosave-的永久失败分类在生产中不可达-) 分支永不生效的原因 |
| `lib/ats-report.ts:229-231` | 「`text-layer-missing` 与 `glyph-loss` 按构造必为假，所以**不参与评估**」 | `:231` 是 `evaluateFindings(extracted)`——全部规则都跑；只是 `:223` 把 `pageCount` 传了字面量 `1` 导致它们不触发 |
| `service/resumevault/presentation.go:159-161` | 「不能严格解码两次，否则 `version` 会被当成未知字段」 | **第一次解码就是这么做的** → [A1](#a1--patch-presentation-对每个真实请求都返回-400一个-wire-契约被两层各自严格解码-) |
| `service/resumevault/resume.go:46-51` | `listResumes` 由两个 handler 共享「所以两者不可能不一致」 | `handleListResumes` 重写了一遍 → [A5](#a5--同一路径注册两次正确性依赖注册顺序被遮蔽的-handler-看起来仍然活着-) |
| `components/ResumePageClient.tsx:699-700` | 「复用了同一个 class 串，所以 `toolbarButtonClass` 从下面的 helper 导出」 | 它是 `:57` 的模块级 `const`，在 helper **上面**，且**没有导出**。两半都错 |
| `components/ResumeSourceView.tsx:15-17` | 「可选，因为 builder（`ResumeBuilderPage`）也渲染这个视图」 | 该组件只有一个调用点 `ResumePageClient.tsx:788` |
| `components/ResumeEditor.tsx:1111-1118` | 8 行描述一个**已不存在**的 `FormField` helper（「保留为备注而不是静默删除」） | 在文件末尾记录一个「不存在」 |
| `components/CreatePageClient.tsx:6` | 「⚠️ Deprecated」 | 无工单号、无删除条件，实际是全站创建页必经中转 |
| `biz/resumevault/resume.go:943-948` / `service/resumevault/resume.go:255-259` | 元数据格式校验「在 service 层」 | `biz/resumevault/metadata_validation.go:9-20` 说相反（「为什么它住在 domain 而不是 HTTP handler」），代码也只调 `rvbiz.ValidateMetadataPatch`。**三处三种说法** |
| `data/resumevault/resume.go:376-377` | `SetVisibility`「在一条语句里完成」 | 先 `Count`（`:389-395`）再 `Updates`（`:397-406`），非原子（TOCTOU）；`SetApprovalDecision:428-434` 用 `RowsAffected` 才是对的 |

### C2 — 散文式模块头（信息对，位置错）✓

**建议的最小规则**（写进 AGENTS.md 即可生效）：
1. 模块头 ≤ **5 行**：这个模块是什么 + 一条不显然的约束 + 指向 ADR/工单。
2. 「为什么不用方案 X」的论证属于 ADR；文件里只留一行 `// 见 ADR-0007`。
3. 函数注释解释**契约与陷阱**，不复述签名；`@param` 只在语义不显然时写。
4. 陈旧注释视为缺陷：改代码时必须同步改，或删掉。
5. 保留工单号（文件顶部已有），删掉工单正文的复述。

按体量排序的重点清单：`resume-presentation.ts`、`resume-template.ts`、`resume-starters.ts`、`resume-text.ts`、`resume-template-theme.ts`、`resume-render/{ats-safe,classic,primitives,contact,index}`、`ResumePrintView.tsx`、`TemplateSelector.tsx`（首个语句前 37 行）、`http-json.ts`、`list-limit.ts`、`markdown-sanitize.ts`、`usePrefersReducedMotion.ts`、`pdf-assert.ts`、`print-resume.ts`。
具体样本：`ResumePrintView.tsx:7-24` 有 18 行 `# What this file used to be, and why it is now this`，而 ADR-0008 的「实施记录（工单 20）」已经写过同一段（`docs/adr/0008-…:103-191`）；`ats-safe.tsx:6` 直接引用了 ADR 的话（「顺序是刻意的」）。

### C3 — 值得保留的正面样本（不要一起砍）✓

- `lib/version-conflict.ts:84-86` 的「**Consumes the response body.**」——一句话说明 [A7](#a7--同一件事的-n-份实现前端错误体读取-) 那类重复为什么会变成 bug，且**当前准确**。这就是目标风格。
- `lib/autosave-failure.ts:28-34`（408/425/429 为什么可重试，3 行）、`retryDelay:86-92`（为什么封顶 + 为什么 jitter）、`lib/list-limit.ts:60-67`（哪些情况**不**算截断）。
- `app/layout.tsx:27-40`（`noscript` 兜底为什么打在 `[data-motion-reveal]` 而不是内联样式）——短、说了不显然的事、并与一条 a11y 测试互相钉住。
- `invariants/design-system.test.ts:1-33` 是长注释里少见的「必要」：它解释为什么这条测试不在被测文件旁边、为什么必须剥注释才能扫。仍可压到 15 行内。

---

## 5. 文档与规范漂移

### D1 — `AGENTS.md`（前端）：组件清单已名不副实 ✓
组件架构章节缺 **9 个既有 UI 组件**（`Select`、`Skeleton`、`Toast`、`ConfirmModal`、`Modal`、`Pressable`、`Switch`、`Textarea`、`Tooltip`），hooks 列 2 个而实际 5 个（缺 `useResumeAutosave`、`useApiResource`、`usePrefersReducedMotion`），并且完全不提 `components/resume-render/` 与 `components/ai/` 两个子目录。

### D2 — `AGENTS.md`（前端）：两条硬规则与实际严重不符 ✓
- 「**所有页面**使用 `<PageContainer>`」→ 全仓仅 **4 处**。
- 「**禁止使用原生 `<button>`**」→ 约 **120 处**分散在约 15 个生产文件（`ResumeStartScreen.tsx` 约 23、`ResumePageClient.tsx` 约 14、`ResumeEditor.tsx` 约 11、`Navbar.tsx` 约 9 等）。其中 `AISectionChat.tsx:259` 还用 `title=` 而非 `aria-label`。**规则与代码不可能同时为真，必须先决定哪一边改。**

### D3 — `README.md`：与 ADR 冲突 ✓
- `:27` 写「结构化 **YAML frontmatter** + Markdown 正文」——与 ADR-0003/`CONTEXT.md §2` 直接矛盾（frontmatter 已降级为导入导出格式）。
- `:28` 写「**模板市场** … 预设模板」——与 ADR-0008（模板是渲染器，不是内容种子）矛盾。
- 页面表缺 `/admin/ai`、`/admin/approvals`、`/admin/users`。

### D4 — 设计规范不变式只锁了 4 条规则，其余 60+ 处违规 ✓
`invariants/design-system.test.ts` 只断言：冷色调、旧 hex、重阴影、渐变背景（4 条；**这 4 条确实干净**，我逐条核过，`ResumeDisplay.tsx:139` 的 `bg-gradient-to-b` 在注释里、被正确剥离）。而 AGENTS.md 的类名对照表还有 `rounded-xl/2xl`、`border-2`、`text-white`、`duration-200/300` 等条目**无任何守卫**，实测违规（非测试 `src/`，已排除注释）：

| 类名 | 真实代码命中 | 主要位置 |
|---|---|---|
| `rounded-xl` | **8** | `Navbar.tsx`×5、`Button.tsx:85`、`Tabs.tsx:55`、`AIUpload.tsx:848` |
| `rounded-2xl` | **1** | `Button.tsx:86` |
| `border-2` | **15** | `Button.tsx` variant map ×12、`Spinner.tsx:36`、`ResumeStartScreen.tsx:358,421` |
| `text-white` | **12** | `app/**/page.tsx`×3、`Navbar.tsx:50`、`AISectionChat.tsx:339,420`、`AIUpload.tsx:550,765,848`、`ResumeDisplay.tsx:244`、`TemplateSelector.tsx:122,135,241` |
| `rounded-lg` / `rounded-md` | 18 / 6 | 对照表未点名，需产品判断 |

- 顺带的一致性问题：`Button.tsx:28-65` 的 `bordered` variant 硬编码 `border-2`（AGENTS.md 另外禁止），**这正是** `ResumePageClient.tsx:50-79` 用原生 `<ToolbarButton>` 的理由（旧报告 D1 记录了这条互斥）；`ui/Button.tsx:83-86`、`ui/Input.tsx:31` 的 `rounded-none` 是 `radius` prop 的合法 API 面，**不算违规**。
- **建议（S）**：把对照表里可判定的条目加进 invariant（一条 `it` 即可），然后按 [D2](#d2--agentsmd前端两条硬规则与实际严重不符-) 的结论决定是改代码还是改规范。

### D5 — `kratos-server/AGENTS.md`：多处陈旧 ✓
- 声称 frontmatter 被解析以取得元数据（ADR-0003 之后不成立）。
- 仍在描述已退役的 `/api/ai/config`、`/api/ai/test` 与 `ProviderPreset`/`AIMultiConfig` 接口面（代码里已是 `ENDPOINT_RETIRED` 存根，见 [A5](#a5--同一路径注册两次正确性依赖注册顺序被遮蔽的-handler-看起来仍然活着-)）。
- 自相矛盾：`:9` 写 Go 1.26.0，而同文件声明「Dockerfile: Go 1.19 builder」。

---

## 6. 跨仓一致性与守卫

### X1 — 已有的 guard 模式是好的，应继续复用 ✓
`cmd/resumefixtures` + `__fixtures__/server-parser.json` + `resume-parser-parity.test.ts`，以及 `cmd/resumepresentation` + `__fixtures__/server-presentation.json` + `resume-presentation-parity.test.ts`。后者更干净（fixture **从活的 Go 常量生成**，绝不手抄——`cmd/resumepresentation/main.go:28-29` 把这条写成明规则）。
**已验证**：presentation 常量镜像**当前完全一致**（下级重新生成 `cmd/resumepresentation` 输出并与前端 fixture 逐字节比较 → IDENTICAL）。

### X2 — 缺失的 parity 守卫（fixture 只承载常量，不承载**判定**）△
- **展示态校验逻辑**：`resume-presentation.ts:327 validatePresentation` vs `presentation.go:523 ValidatePresentation`。fixture 只带 `palette/templates/fontFamilies/default/bounds/fieldNames`，**从不带 per-input 的判定**。已确认的具体缺口：Go `presentation.go:618` 有 `len(*p.Photo.Path) > 500`，TS `resume-presentation.ts:404-406` **完全没有** photo.path 长度上限 → 600 字的 photo path 被面板接受、被服务端拒绝（正是 parity 测试头 `:32-36` 警告的「永远失败的控制」）。ADR-0004 的实施记录（`docs/adr/0004-…:114-119`）**自己承认**了这个成本。
- **元数据校验器**：`biz/resumevault/metadata_validation.go:37-48,63` 的 6 个 rune 上限、`maxEmailRunes=254` 与 email 正则 vs `lib/resume-metadata.ts:105-131,150`。**两侧无任何互相引用**，caps 与正则是**转录**而非派生。
- **技能切分与章节分类**：Go 导出 `SplitSkillList`（`structured.go:294`）与 `ClassifySection`（`:111`），而 `cmd/resumefixtures` **只序列化 `Sections`**（`main.go:46`）——技能列表与 kind 表是工单 18 最想收敛的两件事，却**恰好**没有跨语言守卫（`collectSkills` 还额外剥 `- `、合并 items+details、去重，Go 里都没有）。
- **已有的 parser 漂移**：`lib/resume-parser.ts:621 stripDateOnlyLines` **只在 `:603` 的最终 flush** 被调用，而 Go `structured.go:352-360` 在**每次** `flushSection`（`:372`，每个 H2）都调用 → 中间章节的纯日期行在预览里留下、在服务端被丢弃。现有语料抓不到（`date-alone-under-skills` 落在**最后**一个章节）。
- **授权名与审批状态**：前端全是**裸字面量**（`app/settings/ai/page.tsx:296-297`、`app/admin/users/page.tsx:140`、`lib/ai-providers.ts:203-206`），后端是常量（`biz/approval/approval.go:38-48`）。而 `CONTEXT.md:116-120` 把 grant 定为「**唯一真相来源**」，`CONTEXT.md:171-177` 禁止偏离其词汇。改一个 Go 常量名 → 两个 TS 调用点运行时静默失效。
- **建议（M）**：新增 `cmd/resumefacts` 输出元数据字段清单、校验上限/正则源串、grant 常量；加 `verdicts` 段落承载「固定输入 → 期望出错字段」的展示态校验判定。**全部复用既有 fixture + parity 模式。**

### X3 — 已核验为「刻意设计，不是缺陷」（不要修）✓
- **前端非权威解析器本体**（ADR-0003 + parity fixture）、`parseHexHsl` 镜像（ADR-0004 + fixture）、`resume-parseability.ts` 数据表（ADR-0008 §3）、`resume-starters.ts` vs `resume-template.ts` 命名分工（ADR-0008 §1）、`resume-text.ts` 的空白/CRLF 规则（ATS 契约）、`export-pdf.tsx` import `ResumePrintView`（ADR-0001/0007 的 DOM 编排器）。
- **渲染器拆分**：`ResumeDisplay`（编辑器预览）vs `ResumePrintView` + `resume-render/*`（打印/权威路径）是 ADR-0008 的决定。**不要**「统一」它们；[R10](#r10--classic-与-ats-safe-各走一遍文档遍历-) 只要求 `resume-render/` **内部**共享遍历。
- **`slug` 生成**只有 Go 一份（`biz/resumevault/resume.go:1253`），前端**有意删除**并在 `lib/resume-parser.ts:628-634` 记录了原因——符合 `CONTEXT.md:28`。
- **AI provider 目录与协议枚举**是服务端权威（`/api/ai/catalog`、`/api/ai/protocols`），前端副本只是「首次响应前的默认值」；`lib/ai-providers.ts:9-13` 记录了**曾经**的第二份副本已被删除。
- **列表 limit** 由响应体承载（`service/resumevault/resume.go:138`、`approval.go:132`），前端不自己 clamp。
- **ATS 报告 / PDF 文字层 / 纯文本渲染 / CJK 统计 / Markdown 消毒 / 模板目录与种子**：目前**只在前端**，Go 侧没有对应物。ADR-0007 §5 把这些划给第二阶段的 Go render service——**届时才会**变成跨语言重复，现在不是缺陷。
- **人类可读时间格式**分工正确：Go 发 RFC3339 并说明原因（`service/resumevault/history.go:175`），前端负责展示。

### X4 — 后端分层本身是干净的（负面结论）✓
- `biz` 从不 import `data`/`service`/`server`/`api`/`conf`（全仓 import 扫描）；`data` → `biz` 有 9 个文件，正是 Kratos 的依赖倒置方向。**唯一破例**：`biz/resumevault/metadata_backfill.go:218-224,311,81-94` 里有裸 SQL 与 `gorm:"column:…"` 标记——domain 层直接点名表与列，建议移入 `internal/data/resumevault`。**不要**把「`data` 依赖 `biz`」当违规去修。
- `service` 从不 import `data`；仓储接口全部**消费者声明**（`SystemConfigRepo`、`ResumeRepo`、`RequestRepo`/`GrantRepo`、`MetadataExecer`/`MetadataQuery`…）——**这是本设计最好的部分**。
- 内置 provider 目录**只有一份**（`ai_registry.go:118` → `catalogByID:209-215` → `ProviderDirectory:389-401`、`displayNameFor`、内置判定共用）。「两/三份目录表」的假设**不成立**。
- 协议枚举与标签在 service 里**没有**副本（`protocolOptions()` 从 `rvbiz.AIProtocols()`/`ProtocolLabel` 派生）。
- 前端 `hooks/`、`contexts/` 无跨层依赖；**没有任何组件 import `app/`**。

---

## 7. 分批整改建议

> 原约定是「先报告、确认后分批改；后端只出报告」。用户随后明确选择**前后端都改**，因此后端约束已解除：`D:\project-me\kratos-server` 已可直接修改。下表是原计划，实际进度见 §7.0。

| 批次 | 内容 | 为什么先做 | 量 |
|---|---|---|---|
| **批 0** | 只改前端：[A1](#a1--patch-presentation-对每个真实请求都返回-400一个-wire-契约被两层各自严格解码-)（后端，需与后端同学一起）、[F1](#f1--账号密码经-url-查询串在-loginregister-之间传递-)、[F2](#f2--autosave-的永久失败分类在生产中不可达--)+[F2b](#f2b--重试预算耗尽后指示器永远显示保存失败重试中且无人被告知-)、[F4](#f4--ai-智能解析按钮在粘贴文本时静默绕过-ai-) | 都是小改动、都是用户可见的正确性/安全问题 | S |
| **批 1** | 接口与守卫：新增 `cmd/resumefacts` parity（[X2](#x2--缺失的-parity-守卫fixture-只承载常量不承载判定-)）、光标 `resume-model.ts`（[A3](#a3--前端的非权威解析器已经是领域内核因此永远无法退役-)）、`readErrorEnvelope`（[A7](#a7--同一件事的-n-份实现前端错误体读取-)）、元数据单一清单（[A12](#a12--元数据字段清单在-56-处跨语言且无跨语言守卫-)） | 先把「同一个事实只有一个来源」立起来，后续搬迁才安全 | M |
| **批 2** | 层次与环：[A13](#a13--lib-不是叶子层两个纯数据模块反向依赖-components-) 两条跨层边 + 两个环；后端 [A4](#a4--后端-aiservice-同时拥有-ai-与审批授权两个限界上下文-)/[A5](#a5--同一路径注册两次正确性依赖注册顺序被遮蔽的-handler-看起来仍然活着-)/[A10](#a10--owner-or-admin-写了-4-遍admin-判定-5-种写法可复用的那个签名不可复用-)/[A6](#a6--发布审批工作流住在-http-handler-里-) | 纯搬迁，行为不变，改动面清晰 | M |
| **批 3** | 重复收敛：前端 [A8](#a8--同一件事的-n-份实现用户可见流程-)/[A9](#a9--前端两个巨型组件resumeeditor-1119-aiupload-1012-)；后端 [A11](#a11--provider-crud-在-biz-与-service-各写两遍-)；脚本 [R3](#r3--两个浏览器验收脚本各实现一遍-printandextract且-chromium-启动样板重复-) | 需要设计决策，风险最高，放最后 | M–L |
| **批 4** | 清洁：死代码 [R11–R16d](#32-死代码零引用已跨-src--scripts-grep-确认)、陈旧注释 [C1](#c1--陈旧注释与代码相反最贵的一类)、注释瘦身 [C2](#c2--散文式模块头信息对位置错-)、文档 [D1–D5](#5-文档与规范漂移)、设计规范 invariant [D4](#d4--设计规范不变式只锁了-4-条规则其余-60-处违规-) | 与批 3 独立，可并行；注释瘦身建议**顺带**做，不要单开一轮 | S–L |

**建议立即决定的一件事**：[D2](#d2--agentsmd前端两条硬规则与实际严重不符-)（`PageContainer` / 原生 `<button>`）必须由产品/设计负责人裁决规范与代码哪一边改——在此之前，任何人按 AGENTS.md 动手都会被误导。

### 7.0 修复进度

图例：`✅` 已修并验证 / `🟡` 部分 / `⬜` 未开始。

| ID | 状态 | 改动 | 验证 |
|---|---|---|---|
| [A1](#a1--patch-presentation-对每个真实请求都返回-400一个-wire-契约被两层各自严格解码-) | ✅ | `biz/presentation.go`：`DecodePresentationPatch` → `DecodePresentationWrite`，一个 `DisallowUnknownFields` 解码器吃下 `{Presentation; Version *int64}` 信封，返回 `(Presentation, int64, error)`；新增 `ErrMissingPresentationVersion`；`service/presentation.go` 删掉第二次 `json.Unmarshal` 与手搭结构体 | 新增 `service/resumevault/presentation_test.go`（5 例，含前端真实报文）与 biz 4 例；`go test ./...` 全绿 |
| [B1](#b1--验证码-_devcode-默认泄露fail-open-) | ✅ | 环境变量判定改为配置：`AppConf.DevCodes`（`app.dev_codes`）→ `wireApp` → `NewAuthService(..., devCodes, ...)`；**缺省即关闭**；`configs/config.yaml` 为本地开发显式打开；启动时 `Warn` 一次 | `go build`/`go vet` 干净；`AGENTS.md:260` 同步 |
| [A2](#a2--sse-流被截断时报成完整答案一个恒真的守卫-) | ✅ | `biz/ai_wire.go`：`scanner.Err()` 只在 `ctx.Err() != nil`（客户端已断开）时静默，其余返回 `STREAM_TRUNCATED` 而**不再** `emit(Done)`；接入 `service/ai.go` 已有的在流内 `{"error"}` 通道 | 新增 `biz/ai_wire_truncation_test.go`（上游半途断开 / 单事件超行上限 / 客户端取消三例）；前端 `sse.ts:89-90` 本就会消费 `{"error"}`，链路已通 |
| [B2](#b2--setprovidercredential-是死代码且把密钥存到了另一个-provider-) | ✅ | 删除 `biz/ai.go` 的 `SetProviderCredential`（零引用，且把密钥记到**旧**活跃 provider、再把活跃 provider 切走；正确实现 `SetGlobalCredential` 已被 `service/ai.go:711,714` 使用，`ai_registry.go:601` 有测试钉住） | `go build` 干净；`TestSetGlobalCredentialTargetsAnyProvider` 仍在 |
| [F1](#f1--账号密码经-url-查询串在-loginregister-之间传递-) | ✅ | `login/page.tsx`、`register/page.tsx`：`goTo*` 不再写入 `password`，初始化也不再从查询串读密码；同页重复读取查询串收敛为一个 `emailParam` 源 | `tsc` 干净；全仓 grep 无其他 `password`-in-URL 路径 |
| [F2](#f2--autosave-的永久失败分类在生产中不可达--) | ✅ | `api-client.ts` 新增 `ApiError`（带 `status`）；`resume-api.ts` **7 处**非 2xx 抛出点统一改抛 `ApiError`；`errorStatus` 收窄到真实契约并改正那段说反的注释 | `resume-api.test.ts` 新增 2 例**穿过真实 wrapper** 断言 `errorStatus`/`classifyFailure`（403 永久、503 可重试）——纯构造 `{status:403}` 的旧测试抓不到这个 bug |
| [F2b](#f2b--重试预算耗尽后指示器永远显示保存失败重试中且无人被告知-) | ✅ | `autosave-failure.ts` 新增纯函数 `reportedFailureKind`：预算耗尽把 `retryable` 上报为 `permanent`（不再留下 `pending`+`retries>0` 这对「重试中」的输入）；`useResumeAutosave` 用它；`ResumePageClient` 补上此前无人传的 `onError`（冲突 → 冲突提示，其余 → toast） | `autosave-failure.test.ts` 新增 4 例；顺带修掉「autosave 抢锁冲突只给一个必然再失败的『重试』按钮」 |
| [F4](#f4--ai-智能解析按钮在粘贴文本时静默绕过-ai-) | ✅ | `ResumeStartScreen.tsx:472` 的 `onClick={selectedFile ? onStartAI : onStartWithText}` → `onClick={onStartAI}`；删除因此变成死链的 `onStartWithText` 全链（`ResumeStartScreenProps`、`UploadExpandedProps`、`handleStartWithText`、`ResumeBuilderPage.handleStartWithText`） | `tsc` 干净；全仓无 `onStartWithText` 残留 |
| [A7](#a7--同一件事的-n-份实现前端错误体读取-) | ✅ | `http-json.ts` 新增 `readErrorEnvelope`（一次 `text()`，返回 `{json, message}`）与 `failureText`（`message ?? \`${fallback}（HTTP ${status}）\``）；`api-client.ts` 的 18 行错大小写块换成 8 行正确说明（字段拼写由各 Go 结构体自己的 `json` tag 决定，`server/http.go:105` 的 `responseEncoder` 对所有路由都是 `encoding/json`）；`resume-api.ts` 删掉本地 `readFailureBody`，11 处读取 / 7 处抛出全部走同一对函数 | `http-json.test.ts` 新增 3 例（含「读完 body 已被消费」）；`resume-api.test.ts` 8 处兜底文案改带状态码；`tsc`/`eslint` 回到基线 |
| [A3](#a3--前端的非权威解析器已经是领域内核因此永远无法退役-) | ✅ | 新增 `lib/resume-model.ts`（**import 为空**的叶子模块）承载 `ParsedResume`/`ResumeSection`/`SectionKind`/`Structured*`/`ResumeMetadataView`/`ParsedFrontmatter`；`resume-parser.ts` 只留 5 个函数、**0 个类型导出**；27 个文件的类型导入改指新模块；`resume-section.ts` 不再反向 import 解析器（环 2 消失） | 新增 `invariants/module-layers.test.ts` 三条规则钉住「叶子不 import」与「解析器可被删除」（导出类型即失败）；`tsc` 0、全量 785 通过 |
| [A12](#a12--元数据字段清单在-56-处跨语言且无跨语言守卫-)／[X2](#x2--缺失的-parity-守卫fixture-只承载常量不承载判定-) | ✅ | 前端删掉 `METADATA_COLUMNS`/`MetadataColumn`（**已漂移**：9 列无 `summary`），统一到 `METADATA_KEYS`；`COLUMN_TO_FRONTMATTER_KEY` 改为 `Record<Exclude<MetadataKey,'summary'>, …>`，`summary` 是「卡片摘要、无 frontmatter 对应」的唯一例外并写明；后端 `validateMetadataValue` 的 switch 改为 `metadataRules` 单表（limit+format+label），新增 `MetadataLimits()`；新增 `cmd/resumefacts` 输出字段清单/上限/grant 常量，前端 `server-facts.test.ts` 断言 `METADATA_KEYS`、`METADATA_MAX_LENGTH` 与之一致，且**源码里 `resourceType:`/`permission:`/`approval_status:` 的裸字面量**全部属于服务端词表 | 统一那一刻 `tsc` 立刻报出 4 处 `summary` 缺失（正是无人测试的那处漂移）；guard 当场又抓出 `ApprovalStatus` 里的 `'draft'`——服务端不存在该状态（`types.ts` 自称「mirror the kratos-server API」），已删除并改 5 处桩数据；Go 新增 2 例守表格完整性 |
| [A13](#a13--lib-不是叶子层两个纯数据模块反向依赖-components-)（环 + 导入约定） | ✅ | 环消除：`ui/ConfirmModal.tsx` 不再 import 自己的 barrel（`@/components/ui`）而直接 import `./Button`；导入约定：`ResumeBuilderPage.tsx`、`UploadPageClient.tsx` 的 `@/components/layout/PageContainer` 改走 barrel，`ResumeCard.tsx` 的 `ChipProps` 由 `ui/index.ts` 补 `export type`（与既有 `ToastData` 一致） | `invariants/module-layers.test.ts` 新增「barrel 的成员不得 import 该 barrel（`import type` 豁免）」并**先验证过会失败**（把 `ConfirmModal` 改回 barrel 即报 `ui/ConfirmModal imports its own barrel`）；`tsc` 0、`eslint` 23、全量 787 通过、`npm run build` 0 |
| [A13](#a13--lib-不是叶子层两个纯数据模块反向依赖-components-)（注册表拆分） | ✅ | 按报告建议的 (a) 实施：`lib/resume-template.ts` 新增 `TEMPLATE_METADATA`（纯数据：id/name/description/facets/parseability/tokens）+ `RegisteredTemplateId` + `DEFAULT_TEMPLATE_METADATA`；两个渲染器文件**只导出渲染函数**（`AtsSafeResume`/`ClassicResume`），`components/resume-render/index.ts` 用 `RENDERERS: Record<RegisteredTemplateId, TemplateRenderer>` 把两边配起来；解析函数（`resolveTemplate`/`presentationFor`/`templateForPresentation`/`findTemplate`）改按 `TemplateLike` 取参，`lib/resume-starters.ts` 不再 import 任何组件 | **报告原估 (S) 偏低，原因是**：`ResumeTemplate` 带 `render: TemplateRenderer`，整体搬只是把 `lib → components` 这条边从 `resume-starters.ts` 挪到 `resume-template.ts`。`Record<RegisteredTemplateId, …>` 让「加了模板忘加渲染器」变成编译错误；`TemplateSelector` 的缩略图按 id 从注册表取可渲染项——它才是真正需要渲染器的地方。新增不变式「`src/lib/**` 不得 import `src/components/**`」（唯一豁免 `export-pdf.tsx`，ADR-0001/0007），**先验证过会失败**：取消豁免即报 `src/lib/export-pdf.tsx imports a component`，即全仓只剩这一条合法边 |
| [X2b](#x2--缺失的-parity-守卫fixture-只承载常量不承载判定-) | ✅ | `resume-parser.ts` 每个 H2 的 flush 由 `contentBuffer.join('\n').trim()` 改为 `stripDateOnlyLines(...)`，与 Go 的 `flushSection`（每个 H2 都 strip）一致；此前**只有最后一个 section** 会 strip | 语料新增 `date-alone-in-a-middle-section`（旧语料的 stray date 恰在最后一段，所以抓不到）并重新生成 fixture；**先把修复回退验证过**：报 `content` 差异 `"Go、Rust\n\n*2022.03 - 2024.06*"` vs `"Go、Rust"` |
| [A5](#a5--同一路径注册两次正确性依赖注册顺序被遮蔽的-handler-看起来仍然活着-) | ✅（`.proto` 删除退役 RPC 待做） | `handleListResumes` 不再重写一遍 scope switch 与 limit 解析：新增 `requestedListLimit`，`listResumes(ctx, scope, limit)` 成为唯一解析处，proto 与 custom 两个 handler 都走它（那段「两者不可能不一致」的注释随之成真）；新增 3 条注册表守卫 | `routes_test.go`：custom 必须先于 proto 注册；被遮蔽的 5 条路径**恰好**是文档化的那 5 条（棘轮）；5 个 `ENDPOINT_RETIRED` 存根要么被遮蔽、要么在文档化清单里（其中 3 条真的可达）。**三条都先验证过会失败**（交换注册顺序 → `v1.RegisterResumeHTTPServer(srv is called before registerCustomHandlers`）。新增 `requestedListLimit` 7 例（含「不可解析 → 默认页」而非「无上限」） |
| [A10](#a10--owner-or-admin-写了-4-遍admin-判定-5-种写法可复用的那个签名不可复用-) | ✅ | `requireAdmin`/`requireNonGuest`/`currentUser` 改声明在 `context.Context` 上（`kratoshttp.Context` 内嵌它，JSON handler 照旧直接传），于是 `admin.go` 的 4 处内联管理员门禁、`ai.go` 的 3 处内联游客判定全部改调共享 helper；新增 `isAdminCaller`，消掉 `resume.go`、`ai.go` 两处即席 `role == "admin"`；`authorizeResume` 增加 `resumeAccess` 参数，把 `UpdateResume`/`UpdateResumeMetadata`/`DeleteResume` 的 3 处内联 owner-or-admin 判定收进去——文案逐字不变（`accessEdit` → 「无权编辑此简历」、`accessDelete` → 「无权删除此简历」） | `go build`/`go vet`/`go test ./...` 全绿。**服务端原先对这些判定零测试**，故新增 `access_control_test.go` 钉住「每个判定只有一个生产者」：`需要管理员权限` 只许 `ai.go`、`游客账户不允许修改 AI 配置` 只许 `ai.go`、`无权访问此简历` 只许 `resume.go`、owner-or-admin 的拼接只许 `history.go`。**先验证过会失败**：把 `admin.go` 的内联副本放回 → `raised by [admin.go ai.go]`；把拼接换成字面量 → `built in []` |
| [A6](#a6--发布审批工作流住在-http-handler-里-) | ✅ | 发布审批工作流从 HTTP handler 迁入 `biz/resumevault`：`ApplyVisibility(ctx, resumeID, visibility, actorID, isAdmin)` 与 `restoreWithdrawnState` 住进 `resume_approval.go`（该文件本就声明「审批模块是唯一的写者」），只依赖一个窄端口 `approvalWorkflow`（4 个操作），与 `approval_backfill.go` 的端口风格一致；`ResumeService` 因此不再需要 `approvalUC`（字段、构造参数、wire 调用一并删除），也不再需要 `"public"` 字面量与 `approvalbiz` 导入。跨层隐式契约消灭：`biz/approval` 新增 `ErrAlreadyPending`／`ErrAlreadyGranted` 哨兵，`Submit` 用 `.WithCause(…)` 附上，调用方改用 `errors.Is`——**线上形状一字未改**（同样的 code／reason／中文文案） | `go build` 0、`go vet` 0、`go test ./...` 6/6。新增 `resume_approval_test.go` 7 例（重复申请＝成功且回滚可见性、未所属简历拒绝 `RESUME_UNOWNED`、管理员直批给所有者、撤回后恢复上次决定、简历不存在 404、审批模块缺失时**拒绝**而不是静默发布、**哨兵而非 reason 字符串**），全部用一个假端口 + 既有 `fakeResumeRepo`，不碰数据库——那条「重复申请」分支以前住在 handler 里，根本测不到。**先验证过会失败**：把 `errors.Is` 换回 `kerr.FromError(err).Reason == "ALREADY_PENDING"` → `TestTheDecisionIsTheSentinelNotTheReasonString` 立刻失败，而「重复申请＝成功」那条仍然通过，证明它区分的正是哨兵与字符串 |
| [A4](#a4--后端-aiservice-同时拥有-ai-与审批授权两个限界上下文-) | ✅ | 6 个审批/授权 handler（审批队列、决策、提交申请、我的权限、授予、撤销）改挂新的 **`ApprovalService`**。没有塞进 `AdminService`：其中两条路由（提交申请、读自己的权限）**根本不是管理动作**，塞进去只是把「说不通的名字」换一个。身份/授权助手抽成 `caller`（新 `caller.go`），由 `AIService` 与 `ApprovalService` **内嵌**，因此 `s.currentUser`／`s.isGuest`／`s.requireNonGuest`／`s.holdsGlobalGrant` **零改动**继续工作，而 `ai.go` 不再是「包内身份助手的家」；`writeJSON`／`isoTime` → 新 `http.go`，`truncateRunes` → 新 `text.go`。`ai.go` 1386 → 1235 行——纯搬迁，无行为变化 | `go build` 0、`go vet` 0、`go test ./...` 6/6。新增 `TestTheApprovalSurfaceIsServedByTheApprovalService`：断言 6 条审批/权限路径的注册接收者必须是 `approvalSvc`，补上编译器管不到的那一半（「新加的 handler 挂回 AI 服务」）。**先验证过会失败**：把 `r.GET("/api/admin/approvals", …)` 原样搬回 `aiSvc` → **编译期即报错**（`aiSvc.handleListApprovals undefined`，即类型拆分本身已被编译器守住）；再按真实漂移场景新增一条 `/api/admin/approvals/preview` 挂在 `aiSvc` → 测试失败并指名路径与理由。另：`access_control_test.go` 的两条期望从 `ai.go` 改为 `caller.go`——**守卫先失败了一次，而那正是它存在的意义**（让搬家可见） |
| [A8](#a8--同一件事的-n-份实现用户可见流程-)（写回服务端记录） | ✅ | 「服务端记录写回」原本手写在 **6** 处（保存／自动保存／回滚／元数据／可见性／冲突后重载），其中 2 处只写「行」。元数据路径最能说明这是漂移而不是决策：`UpdateResumeMetadata` 的注释自述「元数据编辑返回文档，因此也返回文档结构」——服务端专门为它返回 `content` 以免解析变旧，**客户端把它丢掉了**。现在只有一个 `applyServerRecord(data)`：行、解析、正文、冲突提示是同一条记录的属性，不是每个调用点各自的决定。全文件中 `setResume(data.resume)`／`setParsed(clientParsed(…))`／`setMarkdown(data.markdown)` **各只出现 1 次** | 新增 `ResumePageClient.record-writes.test.ts` 把这条变成棘轮：三者各 1 次 + helper 声明 1 次 + 6 条写回路径都走它。**先验证过会失败**：再加一份手写写回 → 立刻 `expected 2 to be 1`。`tsc` 0、`eslint` 23（基线）、`vitest` 797 通过。另：6 个回调的依赖数组补上 `applyServerRecord`（`[]` 依赖，稳定） |
| [A9](#a9--前端两个巨型组件resumeeditor-1119-aiupload-1012-)（热路径 + line-diff） | ✅ | 两处已修：(a) `ResumeEditor` 的 `parsedToEditable(parsed)` **每次渲染都重解析整篇文档**，而结果只被首个渲染消费——即**每次按键重解析全文再扔掉**；改为惰性 `useState(() => …)`，解析只发生一次。(b) `AIUpload.computeLineDiff` 是 O(m·n) 纯逻辑却住在 `.tsx` 里（`.tsx` 无法被测试或 node 脚本导入，本仓 `ats-analyse.ts` 已有先例），迁到 `src/lib/line-diff.ts` 并补测试 | `tsc` 0；新增 `src/lib/line-diff.test.ts` **8 条**（用 diff 重建两侧的不变量、空行、末尾换行、中文按行切、增/删/替换）；`ResumeEditor.a11y.test.tsx` 8 条仍通过——惰性初始化不改变重置协议（`resetToken` 块自己解析）。**剩余**：`ResumeEditor` 的 11 个变更器／顶底栏外壳／`SectionCard`，`AIUpload` 的 `useAIParse`／`useResumeSave`／`<ChatPanel>`／保存与聊天重复未拆 |

**批 1 门禁**：后端 `go build ./...` 0、`go vet ./internal/... ./cmd/...` 0、`go test ./...` 6/6 包通过（`biz/resumevault` 含新增的表格完整性 2 例）；前端 `tsc --noEmit` 0、`eslint src` **23 项（仍等于修前基线）**、`vitest run` **787 通过** / 3 预期失败 / 1 跳过、`npm run build` **0**（批 1 改的是模块边界，构建器是对它的独立检验）。修前 768，批 0 后 774；增量全部是新增用例与新增的 `invariants/module-layers.test.ts`（现 5 条规则）。

> **仍未做（批 1 剩余口径）**：[X2c](#x2--缺失的-parity-守卫fixture-只承载常量不承载判定-) 的 `verdicts` 段（固定输入 → 期望出错字段的展示态判定）尚未加入 `cmd/resumefacts`。字段清单与上限已由 fixture 钉住；`verdicts` 要的是「同一份前端校验规则在 fixture 上重放」，需要先把前端校验的错误字段序暴露成纯数据。
>
> **A12/X2 的诚实边界**：`metadata_limits` 与 `METADATA_MAX_LENGTH` 现在是同源断言，但 **fixture 需要手动重新生成**（`go run ./cmd/resumefacts > src/lib/__fixtures__/server-facts.json`），与既有的 `server-parser.json` 同一约定——守卫的价值在于「重新生成时的 diff 就是前端必须跟进的清单」。三个 fixture 现已按用户决定**纳入版本控制**（`git add src/lib/__fixtures__/`：`server-parser.json`、`server-presentation.json`、`server-facts.json`，已 staged、未提交）。注意 `core.autocrlf` 会把它们按 CRLF 检出，而 `go run … > file` 写出的是 LF——重新生成时若 `git diff` 显示整文件改动，那是行尾而不是内容。

**批 2 门禁（A5 / A10 / A6 / A4）**：后端 `go build ./...` 0、`go vet ./internal/... ./cmd/...` 0、`go test ./...` 6/6 包通过（`internal/service/resumevault` 新增 3 条注册表用例 + 2 条访问控制用例 + `requestedListLimit` 7 个子用例；`internal/biz/resumevault` 新增 7 条发布工作流用例）；前端本轮未改动，沿用批 1 的门禁结果（`tsc` 0、`eslint` 23、`vitest run` 787 通过、`npm run build` 0）。

> **批 2 完成**（A5 / A10 / A6 / A4）。下一批是 **批 3 重复收敛**：A8／A9／A11／R3 —— `useResumeListing`、`useProviderAdmin`、`useEmailCode`、`FileDropzone`、`useAsyncResource`、`applyServerRecord`；`ResumeEditor`／`AIUpload` 拆分；provider CRUD 去重；`scripts/lib/chromium.mjs`。
>
> **A5 的 `.proto` 部分为什么没做——这是有证据的结论，不是省略。** 删退役 RPC 必须重新生成 `api/**/*.pb.go`，而本机 `protoc-gen-go` 与当初生成这些文件的那一版**不一致**。我按 Makefile 里 `make api` 的原参数、在**未改动**的 proto 上跑了一次探针：`ai.pb.go`、`auth.pb.go`、`user.pb.go` 都出现与本任务无关的改动——import 分组被重排，且 `rawDesc` 里描述符长度变化（`UserInfo` 由 `\xb6\x01` 变 `\xd5\x01`），说明产物在语义上有差异，不只是格式。探针已完整回滚（`api/` 用运行前副本还原，`git status -- api/` 回到 4 条基线：`D admin_ext.go` 与 3 个 ` M`）。另：`api/resumevault/v1/resume.proto`、`resume.pb.go`、`resume_http.pb.go` 在本次会话之前就带着**未提交的 WIP**（正在新增 `UpdateResumeMetadata`、版本历史等 RPC），此时重新生成会与之冲突。**根因是 `make init` 用 `@latest` 安装插件：仓库不锁定生成器版本**，于是「谁重新生成谁引入无关 diff」是必然的。
>
> 所以 A5 这一轮交付的是「让遮蔽不再隐形」：注册顺序、被遮蔽集合、退役存根清单三件事都变成了会失败的断言；将来删掉 `.proto` 里的退役 RPC 时，这些断言会主动要求把清单收缩（棘轮），而不是继续沉默。

**批 3 门禁（进行中：A8 写回记录 / A9 热路径）**：前端 `npx tsc --noEmit` 0、`eslint src` 23（基线）、`vitest run` 797 通过 / 3 expected fail / 1 skipped（新增 `src/lib/line-diff.test.ts` 8 条 + `src/components/ResumePageClient.record-writes.test.ts` 2 条）、`npm run build` 0；后端本轮未改动，沿用批 2 门禁（`go build` 0、`go vet` 0、`go test` 6/6）。

> **批 3 仍未做**：A8 的其余 5 组重复（`useResumeListing`、`useProviderAdmin` + `<ProviderAdminSection>`、`useEmailCode` + `<AuthCard>`、`<FileDropzone>`、`useAsyncResource` + `<LoadFailure>`）、A9 的两个巨型组件拆分、A11（provider CRUD 在 biz 与 service 各写两遍，约 250 行）、R3。
>
> **一处与报告不同的计数（A8）**：报告写「4 字段块 ×4 + `:514` 只更新 1 个字段」，实际是**6 处写回、2 处只写行**——除可见性外，元数据保存（`handleSaveMetadata`）同样只写行，而它才是证据更硬的那一处：服务端为该路由专门返回 `content`（`service/resumevault/resume.go` 的 `UpdateResumeMetadata` 自述「元数据编辑返回文档，因此也返回文档结构」），客户端却丢掉了它。

**批 0 门禁**：后端 `go build ./...` 0、`go vet ./internal/... ./cmd/...` 0、`go test ./...` 6/6 包通过；前端 `tsc --noEmit` 0、`eslint src` 23 项（= 修前基线）、`vitest run` 774 通过 / 3 预期失败 / 1 跳过（修前 768）。

> **一次与基线无关的抖动**：全量 `vitest run` 首跑时 `pdf-assert.test.ts` 在默认 5s 超时处失败（29 个 worker 并发时 pdfjs 初始化超时），单独重跑 482ms 通过，再跑全量也通过。属既有并发抖动，非本次改动引入。

---

## 8. 审计过程记录（供追溯）

- **审计阶段未修改任何业务代码**（唯一新增文件是本报告；一次性脚本在 `.audit/graph.mjs`、`.audit/comments.mjs`，可删）。**修复阶段**（§7.0）按用户指示前后端都改，改动清单见各行「改动」列；本报告的结论未因修复而改写，只在 §3.5、§7.0 追加。
- **一次越界已修复**：一个下级审计在 `src/lib/zz-probe.test.ts` 建了一个无断言的占位文件（用于探测），其沙箱拒绝了删除。我已用 `Remove-Item -LiteralPath` 删除并确认不存在（`git status` 无该文件）。
- **下级审计的覆盖率自述**（用于判断哪些结论需要复核）：
  - 后端冗余审计：`internal/service/resumevault/ai.go` ~205-435 / 600-676 / 926-1340 与 `internal/biz/approval/approval.go` ~100-310 / 390-560 为**抽样**，其余逐行读。
  - 后端分层审计：全部逐行读；[A1](#a1--patch-presentation-对每个真实请求都返回-400一个-wire-契约被两层各自严格解码-) 额外用 `go test -overlay` 在真实 package 上执行复现（探针写在 `%TEMP%`）。
  - 前端组件审计：全部逐行读，并跑了 `tsc --noEmit` 与 `eslint`。
  - 跨语言审计：全部逐行读；两个结论（parser 输出形状、camelCase 元数据丢失）未能执行验证——其中 camelCase 那条**经我复核为错误**，已在 §0 剔除。
- **我本人复核过的**（`✓` 标记）：A1、A2、A3、A4、A5、A7、A13、R1–R7、R11–R16、F2、F2b、F3、D1–D5、C1–C3、X1、X4，以及 §0 那条驳回。
