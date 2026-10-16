# 13 — slug 竞态与纯中文标题修复

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：无
- **Blocks**：—
- **ADR**：[ADR-0010](../../../docs/adr/0010-content-versioning-and-optimistic-locking.md)

## 背景

`kratos-server/internal/biz/resumevault/resume.go` 的 slug 生成有两个缺陷。

### 缺陷 1：先查后插的竞态

```go
slug := generateSlug(name)
exists, _ := uc.resumeRepo.SlugExists(ctx, slug)
if exists {
    slug = slug + "-" + id[:8]
}
```

两个请求同时查到"不存在"，然后一起插入 → 其中一个撞唯一约束 → **表面为 500**。`SlugExists` 是 check-then-insert，**无唯一约束冲突重试**。

### 缺陷 2：纯中文标题退化为哈希

```go
slug = regexp.MustCompile(`[^a-z0-9\p{Han}\p{Hiragana}\p{Katakana}-]+`).ReplaceAllString(slug, "-")
slug = strings.Trim(slug, "-")

if slug == "" || !regexp.MustCompile(`[a-z0-9]`).MatchString(slug) {
    h := sha256.Sum256([]byte(name))
    slug = fmt.Sprintf("resume-%x", h[:4])
}
```

**Han 白名单是死代码**：第一个正则允许 CJK 通过，但第二个检查**要求至少一个 `[a-z0-9]`**。于是：

| 输入 | 结果 |
|---|---|
| `张三的简历` | `resume-1a2b3c4d`（哈希） |
| `张三 Zhang San` | `张三-zhang-san`（Han 存活，因为 `zhang` 提供了 `[a-z0-9]`） |
| `李雷` / `韩梅梅` | **都走哈希**；同名两人还会撞同一前缀 |

即：**纯中文名的简历 URL 全是哈希乱码**，而中文名恰恰是这个产品的主流输入。

## 任务

1. **消除竞态**：让数据库唯一约束来保证，**捕获唯一冲突后重试**（而非先查后插）
2. **修复纯中文 slug**：允许纯 CJK slug 通过（去掉 `[a-z0-9]` 强制要求，或改为"至少有 CJK 或 `[a-z0-9]` 之一"）
3. **注意 URL 编码**：中文 slug 在 URL 中会百分号编码。确认：
   - `GET /api/resumes/by-slug/{slug}` 能正确路由与解码
   - `src/app/resume/[slug]/page.tsx` 的 `generateMetadata` 与 `fetch` 能处理编码后的 slug
   - 前端 `Link href={\`/resume/${slug}\`}` 对中文 slug 正确
4. **前端死代码**：`src/lib/resume-parser.ts` 的 `generateSlug` **全仓库零调用**（slug 由后端生成且不可变）→ **删除**，而不是"修复它"
5. 决定**是否允许改名**：slug 创建后不可变，而 `PUT` 只能改 markdown（从 frontmatter 重推 `Title`/`Name`）→ 无"重命名简历"或"改公开 URL"能力。**本工单至少记录该限制**；实现见工单 15/40

## 验收标准

- [ ] 并发创建同名简历 → **不再 500**，两者都成功且 slug 不同
- [ ] 纯中文标题产出**可读的**中文 slug（而非哈希）
- [ ] 中文 slug 的公开页可正常访问（含 SSR 与前端导航）
- [ ] `src/lib/resume-parser.ts` 的 `generateSlug` 已删除
- [ ] 后端有测试覆盖：纯中文、中英混排、同名冲突、并发冲突、空标题
- [ ] 记录"slug 不可变"这一限制的处理决定

## 备注

- ⚠️ **存量数据的兼容性**：已有简历的 slug 是哈希形式。**本工单不改动存量 slug**（改变公开 URL 会破坏已分享的链接）。只影响新建简历。
- 若决定支持改名，需要额外考虑"旧 slug 重定向"——**不要静默让旧链接 404**。

## Comments

### 实施结果（已完成）

两个缺陷都已修复，**存量 slug 未改动**。真机验证：10 个并发同名创建全部 201、slug 互不相同、0 个 500。

#### 验收标准逐条核对

| 验收标准 | 结果 | 证据 |
|---|---|---|
| 并发创建同名简历不再 500，两者都成功且 slug 不同 | ✅ | 真机 10 并发同名上传 → **状态码 `{201: 10}`**，10 个不同 slug；库内统计 `bare=1, suffixed=9`（见下） |
| 纯中文标题产出**可读的**中文 slug | ✅ | `张三的简历` → slug `张三的简历`（不再是 `resume-1a2b3c4d`） |
| 中文 slug 的公开页可正常访问（含 SSR 与前端导航） | ✅ | `GET /api/resumes/by-slug/%E5%BC%A0...` → 200；**原样 UTF-8 字节**走请求行 → 也是 200；未知 slug → 404 |
| `src/lib/resume-parser.ts` 的 `generateSlug` 已删除 | ✅ | 全仓库（`src/` + `scripts/`）零引用；`tsc --noEmit`、`npm run build`、`npm run test` 全绿 |
| 后端有测试覆盖：纯中文、中英混排、同名冲突、并发冲突、空标题 | ✅ | 新增 `resume_slug_test.go`，14 个测试函数、约 45 个用例 |
| 记录"slug 不可变"这一限制的处理决定 | ✅ | 见下方「slug 不可变的处理决定」，并已写入 `CONTEXT.md` 的 slug 词条 |

#### 缺陷 1：先查后插的竞态

原代码读一次再写：

```go
slug := generateSlug(name)
exists, _ := uc.resumeRepo.SlugExists(ctx, slug)   // 读
if exists { slug = slug + "-" + id[:8] }
uc.resumeRepo.Create(ctx, resume)                  // 写
```

**读无法预占一个值**，所以两个并发请求都看到"空闲"，都插入，其中一个撞唯一约束 → 500。这不是"重试没写好"，是形状本身不可能正确。

修法：把裁决权交给唯一约束，`Create` 把唯一冲突翻译成领域错误，用例按候选序列重试。

- `internal/biz/resumevault/resume.go`：新增 `ErrSlugTaken`；`SaveResume` 改为 `maxSlugAttempts = 5` 的重试循环，配合新的 `slugForAttempt(base, id, attempt)`
- `internal/data/resumevault/resume.go`：`Create` 用 `isUniqueViolation` 判断并返回 `ErrSlugTaken`
- **`SlugExists` 已从 `ResumeRepo` 接口删除**（含 data 层实现）。它唯一的用途就是支撑那个错误形状，留着只会继续邀请"先查后插"。data 层留了一段注释说明为什么这里**不该**有这个方法。

`isUniqueViolation` **按 SQLSTATE `23505` 结构判断**，不是匹配错误文本：错误消息受服务端 `lc_messages` 影响，字符串匹配会在非英文 locale 下静默失效——那会把"可重试的碰撞"重新变回 500。同时保留一个子串兜底，用于内存假实现。

候选序列：`slug` → `slug-<id 前 8 位>` → `slug-<id 前 8 位>-<n>`。第 0 次就是可读 slug 本身，所以无人重名的常见情况产出的就是 `张三的简历`，不带任何尾巴。

**非 slug 的写入错误不重试**：重试一个不可能成功的操作比直接失败更糟——它放大负载，并把真实原因藏在通用错误后面。有测试钉住这一点。

#### 缺陷 2：纯中文标题退化为哈希

```go
slug = regexp.MustCompile(`[^a-z0-9\p{Han}\p{Hiragana}\p{Katakana}-]+`)...  // 允许 CJK
...
if slug == "" || !regexp.MustCompile(`[a-z0-9]`).MatchString(slug) {       // 却要求有 a-z0-9
```

第二行让第一行的 CJK 部分成了**死代码**。修法：`slugAllowed` 改为 `[a-z0-9\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}]`——"至少有一个可读字符"，而不是"至少有一个拉丁字母或数字"。顺带补上了**谚文**（朝鲜语），原模式声称支持 CJK 却漏了它。

两个正则**提到包级变量**。它们原本写在函数体里，于是每创建一份简历都要重新编译同一个模式两次，而 `regexp.MustCompile` 恰恰是慢的那种。

#### 真机验证（`cmd/t13route` + `cmd/t13race`，用完即删）

在干净的 scratch 库（`rv_t13`，迁移自动执行，记录 `0 baseline_automigrate` / `1 add_resume_version_column`）上跑真实 HTTP：

```
created resume 7b63d2f5.. slug="张三的简历" title="张三的简历"
  [PASS] slug is the readable Chinese title        slug="张三的简历" want="张三的简历"
  [PASS] slug is not a fallback hash               slug="张三的简历"
  [PASS] PathEscape produced percent-encoding      张三的简历 -> %E5%BC%A0%E4%B8%89%E7%9A%84%E7%AE%80%E5%8E%86
  [PASS] GET by-slug, percent-encoded segment      HTTP 200, resolved=7b63d2f5
  [PASS] the reported slug round-trips byte-for-byte
  [PASS] GET by-slug, raw UTF-8 bytes in the path  HTTP 200, resolved=7b63d2f5
  [PASS] an unknown slug 404s                      HTTP 404
0 failure(s)
```

```
=== 10 simultaneous uploads of the same Chinese name ===
  statuses: map[201:10]
  distinct slugs: 10 / 10 successful
  bare=1, suffixed=9
0 failure(s)
```

那 9 个带后缀的 slug 就是**重试循环真的跑了 9 次**的证据——不是"恰好没撞上"。裸 slug 只有一个，因为只有第一个插入能赢。

**为什么要真机验而不是靠单元测试**：内存假实现只能证明用例会响应 `ErrSlugTaken`，无法证明真正的唯一索引真的产生这个错误，也无法证明 data 层的翻译认得 pgx 实际返回的东西（SQLSTATE 写错、错误被包装，都会让重试循环形同虚设，500 原样回来）。

**为什么"原样 UTF-8 字节"那条要用裸 socket**：Go 的 `http.Client` 会拒绝构造路径含未转义非 ASCII 的请求，所以这个用例无法用标准客户端表达——而它恰好就是前端 `Link href={\`/resume/${slug}\`}` 今天产生的形状。于是改用 `net.Dial` 手写请求行。

#### 一个我自己犯的测量错误（记录以免重蹈）

第一次跑并发测试时，内存假实现里写的是：

```go
if f.slugs[resume.Slug] { return ErrSlugTaken }
f.slugs[resume.Slug] = true
```

——这是**生产代码刚修掉的那个竞态本身**：两个 goroutine 都在对方写入前读到"空闲"。测试因此报 `slug "张三" was handed to two resumes`，看起来像 `SaveResume` 有 bug，实际是假实现不像数据库那样原子。加了 `sync.Mutex` 让"检查并占用"成为原子操作，因为真实的 `INSERT` 就是原子的（数据库会串行化两个同 slug 插入，恰好一个胜出）。**教训：假实现必须复刻它所替代的那个机制的关键属性，否则测试会指责错的对象。**

另外 `TestCreatingTheSameNameTwiceSucceedsInsteadOfFailing` 期望 `Create` 被调用 2 次，实际 3 次。不是 bug：第 1 次重试追加 `id[:8]`，而假实现的 id 是连续生成的、首字节相同，所以 `张三-12345678` 也真的撞上了，第 2 次重试靠计数器才赢——**升级策略正在做它该做的事**。已把断言改成 3 并注明原因。

#### 附带修掉的一个测试污染缺陷

`resume_version_test.go`（工单 12）里的 `newLockedUsecase` 构造 `&ResumeUsecase{resumeRepo: repo}` 时**没有设 `storageDir`**，于是写入路径变成 `filepath.Join("", "r1.md")`——相对于进程工作目录，也就是**包目录**。`r1.md` 和 `shared.md` 因此每次跑测试都被丢进源码树：测试结果是绿的，`git status` 里却多出两个未跟踪文件，在只读检出上则是硬失败。

只修那一个测试会留给下一个测试同样的机会，所以在 `resume_slug_test.go` 加了 `TestMain`，**整个包**改在一次性临时目录里运行；需要真实目录的测试照旧用 `t.TempDir()`。已确认跑完两轮完整套件后包目录里再无 `.md`。

#### slug 不可变的处理决定（本工单要求记录）

**决定：slug 创建后不可变，本工单不提供改名能力，也不改动存量 slug。**

理由：

1. **改 slug 等于改公开 URL**，已分享出去的链接会 404。存量 slug 是哈希形式（缺陷 2 的产物），把它们批量改成可读形式听起来是改进，实际是让所有已分享链接失效。**不做。**
2. **改名能力需要配套的旧 slug 重定向**，否则就是静默让旧链接 404。那是一个独立的功能（工单 15 的元数据编辑面板 / 工单 40 的变体管理），不应该顺手塞进本工单。
3. 因此当前用户**没有**"重命名简历"或"改公开 URL"的能力。这是**已知限制**，在 `CONTEXT.md` 的 slug 词条里写明（"创建时由后端生成且此后不可变"），并记录为工单 15/40 的输入。

同时把生成规则与冲突解决规则一并写进了 `CONTEXT.md` 的 slug 词条，并加了"不要在前端再实现一个 slug 生成器"——这正是本工单删掉那份死代码的原因：第二份实现只会与真正的规则漂移。

#### 前端改动

- `src/lib/resume-parser.ts`：删除 `generateSlug`（零调用），原地留一段注释说明为什么这里**不该**有它。
- `src/app/resume/[slug]/page.tsx` **无需改动**：`fetchResumeBySlug` 已经用 `encodeURIComponent(slug)`，实测正确。
- `src/components/ResumeCard.tsx` 与 `admin/approvals/page.tsx` 的 `Link href={\`/resume/${slug}\`}` **保持原样**：slug 由服务端生成时已清洗为 `[a-z0-9\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}-]`，无需额外转义，而实测表明编码形式与原始 UTF-8 形式**都能正确路由**，所以没有必要改动一个已经能工作的链接。

#### 文件清单

**后端（`D:\project-me\kratos-server`）**
- `internal/biz/resumevault/resume.go` — `ErrSlugTaken`、`maxSlugAttempts`、`slugForAttempt`、`SaveResume` 重试循环、重写的 `generateSlug` + 包级正则；接口删除 `SlugExists`
- `internal/data/resumevault/resume.go` — `Create` 翻译唯一冲突、`isUniqueViolation`；删除 `SlugExists` 并留注释
- `internal/biz/resumevault/resume_slug_test.go`（新，14 个测试函数）— 含 `TestMain` 工作目录隔离
- `internal/biz/resumevault/resume_list_limit_test.go` — 假实现新增 `slugs`（含 `sync.Mutex`）、`createCalls`、`createErr`，`Create` 现在强制唯一约束
- `internal/biz/approval/approval.go` — **gofmt**（纯对齐与 import 排序，无语义变化；此文件本就违规）

**前端（`D:\project-me\my-dashboard`）**
- `src/lib/resume-parser.ts` — 删除 `generateSlug`
- `CONTEXT.md` — slug 词条补充生成规则、冲突解决、不可变限制

#### 验证命令

- 后端：`go build ./...` / `go vet ./internal/... ./api/...` / `go test ./internal/... -count=1` → 全部 exit 0；24 个改动 `.go` 文件 gofmt 干净、无 BOM、无 U+FFFD、中文经 .NET UTF-8 解码校验无误
- 前端：`npx tsc --noEmit` / `npm run build`（14 路由）/ `npm run test`（**333 passed, 9 expected fail**）→ exit 0；`src/lib/resume-parser.ts` eslint 零告警

#### 遗留

- **`-race` 未能运行**：本机 MinGW 缺 `ld`（`gcc: fatal error: cannot find 'ld'`），`go test -race` 无法链接。并发正确性由「构建期就绪的 barrier + 假实现在 `sync.Mutex` 下的原子检查并占用 + 真机 10 并发 201×10」三条证据支撑。
- 工单备注提到的**存量哈希 slug 未改动**，符合要求。
- 改名 / 旧 slug 重定向仍缺失，转交工单 15 / 40。

