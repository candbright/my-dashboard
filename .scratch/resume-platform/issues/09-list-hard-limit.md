# 09 — 列表查询硬上限与排序

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：无
- **Blocks**：30
- **ADR**：—

## 背景

`ListResumesRequest` 只有一个字段：

```proto
message ListResumesRequest {
  string scope = 1; // "mine" for user's own resumes
}
```

**无 `page` / `page_size` / `offset` / `limit`，无排序，无搜索，无 `total`。**

数据层确认三个方法全是**无界读取**：`ListPublicApproved` / `ListAll` / `ListByUserID` 都是 `Find(&models)`，最多加一个 `Order("created_at DESC")`。

后果：**把整个用户库拉回前端**。这在简历数量增长后是真实的性能与内存问题。

## 任务

### 第一版（本工单范围）——最小且必须

1. 后端给三个 list 方法加**硬上限**（建议 200），**不引入分页参数**
2. 返回 `total`（或至少告诉前端"已截断"），避免静默丢数据
3. 前端列表在接近上限时给出提示

### 为什么不直接做完整分页

当前规模下不需要，而完整分页（page/page_size/total/游标）会牵动 proto、service、data、前端列表四层。**先做防炸，再做体验**——搜索与分页见工单 30。

## 验收标准

- [ ] 三个 list 方法都有硬上限
- [ ] 超出上限时**不静默截断**（响应中体现总数或截断标记）
- [ ] 前端能识别并提示
- [ ] `ListPublicApproved` 的过滤条件不变（`visibility='public' AND approval_status='approved'`）
- [ ] 后端测试覆盖上限行为

## 备注

- ⚠️ 顺带记录：审批队列也有同样的硬编码上限 `List(ctx, filter, 200)`，**无 offset**，管理员超过 200 条待审会**静默丢失尾部**。属同类缺陷，可在本工单或工单 30 一并处理。
- `resumes` 表除 PK / `slug` 唯一索引 / `user_id` 普通索引外**无其他索引**——`ListPublicApproved` 目前是顺序扫描。索引见工单 11（迁移器）与 ADR-0009。

## Comments

### 环境前置：后端源码位置

**后端源码不在本仓库内**，在 `D:\project-me\kratos-server`（与本工作区平级）。本工单所有后端改动都在那里，验收命令需先 `cd D:\project-me\kratos-server`：

```
go build ./... && go test ./internal/...
```

> 注意：`go build ./...` 会因正在运行的 `bin\kratos-server.exe`（监听 20002）占用输出文件而报 `The process cannot access the file`。这是环境问题，不是编译错误——换一个 `GOTMPDIR` 即可通过。**不要**为了让它通过而杀掉那个进程。

另外 `configs/config.yaml` 里的库是 `infra`（不存在），实际运行用的配置是 `D:\project-me\configs\kratos-server\config.yaml`（库 `resume_vault`，且带 `ai.key_encryption_secret`）。直接照仓库内配置起服务会 `database "infra" does not exist` 或 `AI_KEY_ENCRYPTION_SECRET must be set` 而 panic。

### 实现

**1. 三个 list 方法加硬上限**（`internal/biz/resumevault/resume.go`、`internal/data/resumevault/resume.go`）

`ListPublicApproved` / `ListAll` / `ListByUserID` 的 `Find(&models)` 改为 `Limit(limit)`，`limit` 由调用方显式传入。接口签名全部变成 `List...(ctx, [userID,] limit)`——**故意不把默认值藏在实现里**，否则调用点看不出自己在读一个有界集合，而这正是当初无界读取没被发现的原因。

- `DefaultListLimit = 200`（工单建议值），`MaxListLimit = 1000`，`NormaliseListLimit(<=0) = 200`（"没偏好"而不是"不要数据"，否则改动前不传参数的调用点会拿到空列表）。
- 顺带把 `ListPendingResumes`（第 4 个 list 方法，工单正文只提了三个）也一并加上限。
- 过滤用的字面量提到 domain 常量 `PublicVisibility` / `ApprovedStatus` / `PublicApprovedFilter` / `PendingFilter`，data 层引用它们。理由：「哪些简历是公开的」是业务规则（ADR-0009 把 `visibility`/`approval_status` 定位为 `permission_grants` 的派生缓存），不是 SQL 细节。SQL 片段仍需在 data 层重写一遍——GORM 会原地修改 statement，`Where` 链无法在「列表」和「计数」之间复用——但两处现在共享同一个定义。

**2. 不静默截断：`total` + `truncated`**

截断**用溢出探测**证明，而不是靠 count 推断：每个 List 实现被要求返回 `limit+1` 行，多出来的一行即证明还有更多。`total` 仍来自独立的 `COUNT`（新增 `CountPublicApproved` / `CountAll` / `CountByUserID` / `CountPending`），因为「还有更多」和「一共有 431 条」是两件不同的事，UI 要的是后者。

新增 `ResumePage{Resumes, Total, Truncated}` 承载这三者。裸 `[]*Resume` 无法表达「这是被截断的」，这就是原来那个 bug 的结构性原因。

**3. proto 为什么没动：`admin_ext.go` 挡着**

工单建议「返回 `total`」，最干净的做法是给 `ListResumesReply` 加字段。**做不到**：`resume.pb.go` 是**陈旧**的（提交里根本没有 `UpdateUserAIEnabledRequest`），而 `api/resumevault/v1/admin_ext.go` 用手写 struct 顶替了这个类型，却被 `resume_http.pb.go` 的生成路由引用。用 protoc 重新生成会同时产出 `UpdateUserAIEnabledRequest` 的生成版本，与 `admin_ext.go` 的手写版本**重复定义**，直接编译失败。

（我验证过：`protoc` 重新生成 `api/` 会产生 217 行 diff，其中就包含这个重复类型。已 `git checkout` 还原，工作区无残留。）

所以改成**自定义 HTTP handler**：`GET /api/resumes` → `ResumeService.handleListResumes`，复用现有 `writeJSON` 约定（`handleListApprovals` 等已在用），返回

```json
{ "resumes": [...], "total": 431, "truncated": true, "limit": 200 }
```

响应体键名与 proto 路由一致（`resumes`、snake_case），另加两个 proto 装不下的字段；截断时额外发 `X-Resume-List-Truncated: 1` 头，`X-Resume-List-Total` 始终发，这样只读 body 或只看 network 面板的调用方都不会漏掉。

注册顺序沿用 `service.go` 里已有的「自定义路由先注册」约定（gorilla/mux 按注册顺序匹配），proto 路由保留给仍调用它的客户端。

**这一点是本工单最需要 review 的取舍**：proto 是唯一真源的原则被 `admin_ext.go` 这个既有技术债破坏了。修 `admin_ext.go` 不在本工单范围内，但它应该成为某个后续工单的内容——否则 `api/` 永远无法重新生成。

**4. 审批队列（备注点名）**

备注说的 `List(ctx, filter, 200)` 确实存在（`internal/biz/approval/approval.go` + `internal/data/approval/approval.go`），而且**比简历那条更隐蔽**：

```go
// 旧代码
rows, err := uc.requests.List(ctx, filter, 200)   // 硬编码 200
...
// handler 里
"total":    len(items),    // ← 用「已截断的切片」算总数
"allTotal": len(all),      // ← 同上
```

管理员有 431 条待审时，`total` 会报 **200**——和截断后的列表**自洽**，所以看起来完全正常。这正是本工单要防的失效模式。

现在：字面量 200 → `DefaultListLimit` 常量；`ListPage` 返回 `ApprovalPage{Requests, Total, Truncated}`；新增 `RequestRepo.Count` + `Usecase.Count`；handler 的 `total` / `allTotal` / `counts` 全部改走 COUNT，不再从切片长度推导。`counts` 也从「遍历一次全量列表」改为每类各一次 COUNT（`ResourceResume` / `ResourceAI`），不再依赖一次可能被截断的读取。

### 前端能识别并提示

新增 `src/lib/list-limit.ts`（通用，不依赖简历类型）+ `src/lib/resume-list.ts`（只补简历的行键与措辞）+ `src/components/ui/ListLimitNotice.tsx`（`role="status"`，「自然有机风」用 `rounded-[2rem]` + `bg-warning/10`），接到 3 个页面：`src/app/my/page.tsx`、`src/components/DashboardClient.tsx`（公共简历）、`src/app/admin/approvals/page.tsx`。

两处判断是刻意的，且有测试锁定：

- **响应里没有 `truncated` 就当没截断。** 滚动发布期间浏览器会碰到旧后端；此时误报会让每次加载都弹警告，比短暂少一个提示更糟。
- **`truncated` 为真但 `total <= shown` 时不提示。** 这是自相矛盾的响应，照 flag 渲染会输出「共 3 项，仅显示 5 项」。数字优先于 flag——**错的警告比没有警告更坏**，它会训练用户忽略真正的那次警告。

`ListLimitNotice` 的 `message` 是**必填**（不是可选带默认值）：措辞要说出被列出的是「简历」还是「申请」（审批队列同时承载 AI 权限申请），给默认值必然在其中一页说错名词。

### 验收标准

- [x] 三个 list 方法都有硬上限 —— 实际覆盖 4 个（含 `ListPendingResumes`），另有 `MaxListLimit` 上限防止 `?limit=9999999` 变相解除上限
- [x] 超出上限时不静默截断 —— `total` + `truncated` 进响应体，并配 `X-Resume-List-Truncated` 头；审批队列的 `total`/`allTotal`/`counts` 不再由切片长度推导
- [x] 前端能识别并提示 —— `ListLimitNotice` 接入 3 个页面
- [x] `ListPublicApproved` 的过滤条件不变 —— `visibility = ? AND approval_status = ?` 一字未改，且由 `TestPublicApprovedFilterIsUnchanged` 断言（含两个占位符值本身，写错会让公开列表静默清空）
- [x] 后端测试覆盖上限行为 —— `internal/biz/resumevault/resume_list_limit_test.go`（12 例）、`internal/biz/approval/approval_list_limit_test.go`（8 例），用假 repo，不起数据库

### 验证记录

**后端**（`D:\project-me\kratos-server`）

```
go build ./...            → exit 0（需换 GOTMPDIR，见上）
go vet ./internal/...     → exit 0
go test ./internal/...    → exit 0
  ok  internal/biz/approval
  ok  internal/biz/resumevault
  ok  internal/data/resumevault
  ok  internal/service/resumevault
```

**前端**（`D:\project-me\my-dashboard`）

```
npm run test    → 9 files, 285 passed | 9 expected fail (294)   exit 0
npx tsc --noEmit                                                exit 0
npm run build   → ✓ Compiled successfully, 14/14 static pages    exit 0
npx eslint src  → 14 errors / 18 warnings（改动前同为 14 errors）无新增
```

新增前端测试 `src/lib/list-limit.test.ts` 18 例，覆盖：完整列表不提示、旧后端无元数据不提示、`total <= shown` 的自相矛盾响应不提示、`limit` 缺失/为 0/为负时的默认值、`withheld` 是精确差值、两个列表的措辞各自说对名词。

**实机验证**（真实 Postgres，绕开旧二进制）

用改动后的二进制在 **20011** 端口起了一个临时实例（配置指向同一个真实库 `resume_vault`，只跑只读的 `GET`），与正在运行的旧实例对照：

| 请求 | 旧（20002，运行中的 26524） | 新（20011） |
|---|---|---|
| `GET /api/resumes` | `200`，body **`{}`**，无 total/limit | `200`，`{"limit":200,"resumes":[],"total":0,"truncated":false}`，`X-Resume-List-Total: 0` |
| `GET /api/resumes?scope=mine`（未登录） | — | `401`，空 body（**鉴权未被削弱**） |
| `GET /api/resumes?limit=9999999` | — | `limit` 回显 `1000`（被 `MaxListLimit` 夹住） |
| `GET /api/resumes?limit=abc` | — | `200`，`limit` 回退 `200` |
| `GET /api/admin/approvals`（匿名） | — | `403`（`requireAdmin` 先于列表执行） |

旧二进制的 `{}` 是个额外的实测发现：**现有运行实例的公开列表接口返回空对象**，前端 `readResumeList` 会把它读成「0 份、未截断」。新实现下同一请求返回结构完整的空列表。临时实例、临时二进制、临时配置均已删除，用户正在运行的 20002 进程未受影响（仍由 PID 26524 监听）。

> 未做端到端的一条：**真的凑够 201 条简历看提示是否出现**。截断分支由 Go 单测（溢出探测 → `Truncated`）与前端单测（`truncated:true` → 提示文案）两侧分别覆盖；在真实库里造 201 行数据风险大于收益，故未做。

### 留给后续工单

- `?limit=` 已被接受并夹到 `[1,1000]`，但**没有 offset/游标**——完整分页仍是工单 30，届时可在本 handler 上直接加，不必再开路由。
- `api/resumevault/v1/admin_ext.go` 使 `api/` 无法重新生成（见上）。proto 与生成代码已经不同步，这是一颗定时炸弹：下次谁改 `resume.proto` 都会撞上。
- `resumes` 表仍无 `(visibility, approval_status)` 索引，`ListPublicApproved` 与其 COUNT 目前都是顺序扫描；索引是工单 11 / ADR-0009 的范围。本工单新增的 COUNT 会让这个扫描从「每次一次」变成「每次一次列表 + 一次计数」，**索引的收益因此变高了**。
