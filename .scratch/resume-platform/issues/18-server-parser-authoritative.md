# 18 — 服务端解析器成为唯一权威

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：17
- **Blocks**：25（项目/工作经历区分）、31、32（AI 需结构化访问）
- **ADR**：[ADR-0003](../../../docs/adr/0003-structured-content-model.md)

## 背景

ADR-0003：**服务端解析器是唯一权威**；前端保留的解析能力**仅限正文**，且明确声明为**非权威**。

前端之所以不能完全删除解析器：**编辑时的乐观 UI 需要即时预览，不能每键往返服务端。**

但"正文解析"（章节标题、条目、日期）比"元数据解析"可控得多——后者已被工单 17 移出关键路径。

## 任务

1. **⚠️ 先修工单 17 遗留的元数据读取回归**（工单 15 交接，见其 Comments 的"必须尽快处理的回归"一节）
   - 工单 17 之后 `parsed.frontmatter` **恒为空**，而 6 处"读元数据"的路径仍在读它：`ResumeDisplay`、`ResumePrintView`、`resume-text.ts`、`ResumeBuilderPage`、`ResumeSplitEditor`、`ResumeEditor`（`.md` 导出）。
   - 后果是**预览 + 四种导出（PDF／图片／纯文本／`.md`）全部静默丢元数据**，其中纯文本导出面向招聘系统、`.md` 导出违背 ADR-0003 第 59 行。
   - 修法：**一处** `ResumeRecord → 元数据视图` 的归一化，并复用 `resume-metadata.ts` 的 `METADATA_FIELDS` 做键映射（注意 frontmatter 键是 `title`、列名是 `job_title`，**不能直接传对象**）。有了这一处，其余消费方无需逐个改。
   - 与任务 2 的关系：这正是"`GET` 路径不再自行解析元数据"的前置——先让元数据**来自列**，再由任务 2 把**正文结构**也切到服务端快照。
2. **后端**：保存简历文档后解析并产出**结构化快照**，随 `GET` 返回
   - 章节切分（含标题归一化）
   - 条目切分
   - 日期解析
   - 技能分隔符（**当前前端只按半角 `,` 切分**，需支持 `，`、`、`、`；`、`/`）
3. **前端**：
   - `GET` 路径**消费后端返回的结构化快照**，不再自行解析元数据
   - 编辑时的即时预览**保留一份正文解析器**，但在文件头**显式声明为非权威**，并注明"权威实现见后端 `xxx.go`"
4. **消除三处重复的 `getSectionIcon` / `isSkills` 逻辑**——`ResumeDisplay`、`ResumePrintView`、`ResumeParser` 各写了一套 `includes` 启发式判断，**必然漂移**。收敛为一处
5. **日期格式**：当前正则 `/^\*(.+)\*$/` 只在已有 `currentItem` 时匹配——修复并支持 `2022.03 - 2024.06`、`2022年3月`、`2022/03` 等中文常见格式
6. **技能识别**：当前是 `title.includes('技能')` 启发式 → 改为显式的章节类型标注（由后端在快照中给出）

## 验收标准

- [x] **预览与四种导出（PDF／图片／纯文本／`.md`）的元数据来自数据库列**，`.md` 带合法 YAML frontmatter
- [ ] `GET` 返回结构化快照，前端不再自行解析元数据
      <!-- 前半句已由任务 2 完成并**用真实 HTTP 实测**（见 Comments：GET/PUT/PATCH 三个端点都返回 content）。
           后半句「前端不再自行解析」中，**元数据**确实不再解析（任务 1）；**正文**在 GET 路径改为消费快照，
           但保存/冲突重载路径在服务端不返回 content 时仍会自解析作为降级。因两条路径的端到端浏览器验证尚未补做，此条仍不勾。 -->
- [x] 前端保留的正文解析器有**显式的非权威声明**
- [x] `getSectionIcon` / `isSkills` 逻辑**只有一处实现**
- [x] 日期解析覆盖：`2022.03 - 2024.06`、`2022年3月至今`、`2022/03`、`*2022 - 2024*`
- [x] 技能分隔符支持全角与半角、顿号、分号、斜杠
- [x] **解析 → 回写 → 再解析 幂等**（有测试）
- [x] 后端测试覆盖上述边界
- [x] 前端测试覆盖"快照消费"路径

> 逐条依据见下方 Comments 的「任务 2–6 已完成」一节。第 4 条原文提到 `ResumeParser` 也有一份启发式——实际全仓检索只有 `ResumeDisplay` 与 `ResumePrintView` 两处（`ResumeParser` 从未有过），两处已一并收敛到 `resume-section.ts`。
>
> **关于第 2 条的缺口**：任务 2 的验证是"真实 HTTP + 真实 Go 解析器 + 真实 JSON 载荷"，逐字段核对了 6 个章节。**未做**的是把前端副本指向该 scratch 后端跑一遍浏览器（任务 1 做过一次，本轮未重做）。因此"前端消费快照"目前由单测（`sectionsFromStructuredContent` / `parsedFromStructuredContent` 共 12 个用例）与 parity 测试覆盖，而非端到端浏览器证据——这一点如实记录，不当作已验证。

## 备注

- 幂等测试是**工单 01 建立测试基建的核心目标之一**——一次解析 Bug 就是用户数据损坏。
- 收敛 `readSSEStream` 三处重复（`ResumeBuilderPage` / `AIUpload` / `AISectionChat`）可顺手在本工单或单独小工单处理。
- 任务 1 是**工单 15 明确交接过来的**：工单 15 只修好了"编辑"路径，展示与导出路径留在这里一起修，以免两处各写一套归一化。用户已确认按此顺序执行。

## Comments

### 任务 1 已完成：元数据读取回归已修复（2026-10-13）

#### 根因

工单 17 把元数据搬进 `resumes` 列、并把 frontmatter 从落库文档中剥掉，但**所有"读元数据"的路径仍在读 `parsed.frontmatter`**——那个对象现在**恒为空**。工单 15 只修了"编辑"路径。于是预览与四种导出**静默**丢元数据（不报错、不告警，用户看不出少了东西）。

#### 修法：一处归一化，消费方不动

新增**唯一**的归一化入口（`src/lib/resume-parser.ts`）：

- `METADATA_COLUMNS` / `MetadataColumn`——列名的单一来源，与工单 15 的 PATCH 字段名同构；数据库侧对照见 `internal/data/resumevault/metadata_columns_test.go`。
- `resumeMetadataView(record, documentFrontmatter?)`——**列优先**，只在列为空/空白时回退文档；`''` 与纯空白一律视为"不存在"。返回严格的 `ResumeMetadataView`（全部 `string | undefined`）。
- `withMetadata(parsed, record)`——把视图换进 `ParsedResume`，**纯函数、幂等**，`sections` / `rawContent` **按引用透传**。

关键点：**`job_title`（列）↔ `title`（frontmatter 键）必须显式映射**。直接传 `ResumeRecord` 会丢掉职位——`ResumeRecord` 上是 `job_title`，而 `PlainTextContact` / `ParsedFrontmatter` 认的是 `title`。

选这个切法的理由：记录与正文解析**同时到手**的地方只有两处（服务端渲染、客户端重新解析），在那里归一化一次，其余约 20 个消费方继续读 `parsed.frontmatter`，**无需逐个改动**，也就不会出现"两处各写一套归一化"。

#### 类型分层（为什么不是全 `unknown`）

第一版把 `ParsedFrontmatter` 全部改成 `unknown`，结果 20+ 处编译失败（`Type '{}' is not assignable to 'ReactNode'`）。改为**分层**：

- `ParsedFrontmatter`（原始解析）保持 `unknown`——**这是诚实的**：YAML 真的会给出对象/数组（`&张三`、`[张三]`）。
- `ResumeMetadataView`（严格视图）全 `string | undefined`——这才是"元数据来自字符串列"的真实契约。
- 读元数据的组件收严格类型；**没有加任何逐点 cast，也没有加导入期校验层**。

顺带修掉 `parsedToEditable` 的 `|| ''`（`unknown` 上会得到 `'[object Object]'`），改用 `frontmatterText()`，运行时行为同时变好。

#### ⚠️ 期间发现的新缺陷（本工单顺带修复）

`src/lib/resume-api.ts` 的 `SaveResumeResult` 声明了一个 **后端从来不发** 的 `parsed` 字段，docblock 还写着"后端在服务端解析文档并随原始 markdown 一起返回"。实际上 `buildResumeDetail` 只返回 `resume` / `markdown` / `permissions`，**没有任何 reply 类型带 parsed 字段**（已用 grep 在 `internal/**/*.go` 与 `api/**/*.pb.go` 双向确认）。

于是 `data.parsed` 在运行期**恒为 `undefined`**，`setParsed(data.parsed)` 每次保存/冲突重载都把预览设成 `undefined`。**TypeScript 看不见**，因为 `resume-api.ts` 用 `as SaveResumeResult` 把响应体断言成了这个形状——**断言把一个不存在的字段"断言"了出来，类型检查于是只确认了代码与自己一致，而不是与服务器一致**。

处理：`parsed` 改为 optional 且标 `@deprecated`（保留是为了让删除在 review 里可见），三处调用改为 `clientParsed(data.markdown, data.resume)`（`ResumePageClient` 模块级新助手，说明了为什么客户端重新解析是可接受的：`GET` 是服务端渲染、权威解析在 `page.tsx`，这里只为保存后的刷新）。`resume-api.test.ts` 的 fixture 也去掉了 `parsed`，**不再断言一个不存在的形状**。

#### 六处读取路径的处置

| 路径 | 处置 |
|---|---|
| `ResumeDisplay.tsx` | 类型改 `ParsedResumeWithMetadata`，读 `parsed.frontmatter`（已被归一化） |
| `ResumePrintView.tsx` | 同上（PDF／图片导出渲染的就是它） |
| `resume-text.ts` | **刻意不改**——`PlainTextContact` 结构性声明、用 `unknown`，docblock 已写明"工单 18 会用服务端权威 `StructuredContent` 替换客户端解析，本模块不应因此改动"。喂给它归一化后的 `parsed` 即可 |
| `ResumeBuilderPage.tsx` | 草稿无 `ResumeRecord`，走"文档是唯一来源"分支 |
| `ResumeSplitEditor.tsx` | 用 `resumeMetadataView(null, parsed.frontmatter)`，预览用 `{...parsed, frontmatter: metadata}`；原先保存 `null` 元数据 |
| `ResumeEditor.tsx` | `parsedToEditable` 修好后不再产出空元数据（`.md` 导出另见下） |

`export-pdf.tsx`、`usePdfExport.tsx` 的签名一并收紧为 `ParsedResumeWithMetadata`——这个类型**编码了元数据路径的真实契约**（字符串列经 JSON API）。

#### `.md` 导出（ADR-0003 第 59 行）

**原状违背 ADR**：`ResumeSourceView` 的下载按钮直接下载 `markdown` **prop**，也就是服务端存的 body-only 文档，导出物**没有 frontmatter**；重新导入即丢失全部联系方式——正是 ADR-0003 要求必须能往返的那条路径。

**已修**：`resume-builder.ts` 新增
- `metadataViewToEditableFrontmatter(metadata)`——与 `resumeMetadataView` **互逆**，含 `title` 映射；两个方向现在都有测试钉住。
- `resumeMarkdownExport(metadata, body)`——复用既有的 `serializeFrontmatter`（`js-yaml` 的 `dump`，与读取端 `gray-matter` **同一库**）。没有任何元数据时**不写空 fence**，直接返回 body。

`ResumeSourceView` 新增可选 `metadata` prop：**下载**用 `resumeMarkdownExport`（带 frontmatter，可移植产物），**屏幕上的源码视图与"复制"仍显示存储的 body**——存储文档本来就是 body-only，显示带 frontmatter 的文本会是另一种谎言；旁边就是下载按钮。

值得记一笔：`editableToMarkdown` 的 frontmatter 能力（默认 `includeFrontmatter: true`、有测试）此前**没有任何生产调用方**——两处调用点都传 `{ includeFrontmatter: false }`。本工单让这条已存在、已测试的路径第一次真正被用上。

#### 验证

**真实浏览器 + 真实后端**（`resume_vault_t18` 临时库、端口 20003；隔离的前端副本 30003，`API_URL` 指向 scratch 后端；**未触碰** 30002 与 PID 26524）：

| 项 | 结果 |
|---|---|
| 用真实 API 上传 body-only 简历 + `PATCH` 写满 10 列 + 发布 | 200，列全部落库 |
| 页面标题 `generateMetadata` | `李四 — Resume` ✅ |
| DOM 文本 | 李四 / 后端工程师 / `lisi@example.com` / `13800138000` / 北京市朝阳区 ✅ |
| `mailto:` / `tel:` | 均解析出 ✅ |
| 三个链接 `href` | website / github / linkedin 全部为完整 URL（显示为 `lisi.example.com` 等短标签，故文本断言应查短标签而非完整 URL）✅ |
| 正文 | `某某科技`、`Kubernetes` 仍渲染 ✅ |

单元测试（`npm run test`）：**15 文件，494 passed | 3 expected fail（497）**，本轮新增 11 个用例（`withMetadata` / `resumeMetadataView` / 导出往返）。
门禁：`npx tsc --noEmit` 0；`npm run build` 成功（与用户的 dev server 并行，未干扰）；`npx eslint .` **14 errors / 14 warnings，与改动前基线完全一致**（改动文件内零新增问题）。

RED 阶段已确认：8 个新用例先以 `resumeMetadataView is not a function` 失败，再实现转绿。

#### ⚠️ 浏览器验证时发现的**既有**缺陷：简历详情页无限重渲染（未修，建议单独开单）

在**真实浏览器**里打开 `/resume/seed` 会持续报 `Maximum update depth exceeded`（6 秒 24 次，与交互无关，持续不停）。**这不属于本工单，也不是本轮改动引入的**——已用对照实验定位：

| 实验 | 结果 |
|---|---|
| `/login` 同源同 layout | **0 次** → 不是全局壳/`Navbar`/`AuthContext` |
| `/resume/<不存在>` 404 页 | 无循环 → 不是路由层 |
| 在副本里**禁用** `ResumePageClient` 唯一的 `useEffect`（权限刷新） | **仍循环**（24 次/6s）→ 不是该 effect |
| 在副本里**禁用** `<ResumeDisplay>` 渲染 | **仍循环，且更频繁**（121 次/6s）→ 不是 `ResumeDisplay`／`useResumeMetadataView` |

结论：循环位于 `ResumePageClient` 自身或其剩余子树（`ConfirmModal` / `ToastContainer` / 动画包装），**与本工单无关但真实存在**。

之所以重要：**只有真实浏览器能发现它**——`tsc`、`build`、`eslint`、497 个单测全部通过。它会让详情页持续空转烧 CPU，并可能掩盖真实告警。**本工单未修**（超出范围，且需要独立定位），建议立即单独开单。

#### 未做（本工单后续任务）

> 以下五项**已于同日完成**，见下方「任务 2–6 已完成」一节。

- 任务 2：后端结构化快照随 `GET` 返回（章节/条目/日期/技能分隔符）。
- 任务 3：非权威声明的显式文件头注释；`GET` 路径消费快照。
- 任务 4：三处 `getSectionIcon` / `isSkills` 去重。
- 任务 5/6：日期格式与技能识别。

#### 其他观察

- `ResumeEditor` 的 `frontmatter` state 现为**死代码**：只被 L169 初始化与 L202 reset 写入，两处都经 `parsedToEditable`，而工单 15 删掉了唯一的编辑入口 ⇒ 永久为空且不可达。**未删**（删除会牵动 `editableToMarkdown` 调用点，宜与任务 3 一起做）。
- 导入期运行时校验（`&张三` / `[张三]` 这类非字符串 YAML 值）按 ADR-0003 第 54–60 行属于导入侧，**留给工单 42/43**，本工单不做。
- `resumeMetadataView` 保留"列为空则回退文档"是刻意的：已清空的列是 `''` 而非 NULL，若 `''` 遮蔽文档值，则"清空某字段"将无法通过重新导入恢复。

---

### 任务 2–6 已完成：服务端解析器成为唯一权威（2026-10-13）

#### 做了什么

| 任务 | 落点 |
|---|---|
| 2 后端结构化快照 | **新增** `kratos-server/internal/biz/resumevault/structured.go`：`ParseStructuredContent` / `SplitSkillList` / `ClassifySection` + `StructuredSection` / `StructuredItem` / `SectionKind`。proto 新增 `StructuredContent` / `StructuredSection` / `StructuredItem`，并挂在**每一个带 `markdown` 的 reply 上**：`GetResumeReply.content`、`UpdateResumeReply.content`、`UpdateResumeMetadataReply.content` |
| 3 前端消费快照 + 非权威声明 | **新增** `src/lib/resume-section.ts`（分类/技能，文件头声明非权威）；`resume-parser.ts` 顶部加显式非权威声明块（点名后端 `structured.go`）；新增 `sectionsFromStructuredContent` / `parsedFromStructuredContent`；`page.tsx`、`ResumePageClient` 改为**优先用快照**，仅在字段**缺席**时回退自解析 |
| 4 去重 | `getSectionIcon(kind)` 改为**按类型 switch**；两处 `isSkills` 启发式 → `resolveSectionKind` / `isSkillsSection`；两处 `SkillsGrid` / `PrintSkills` 的 `split(',')` → `collectSkills`。全仓检索：**零残留**的 `includes('技能')` 类判断、零 `split(',')` 技能切分 |
| 5 日期格式 | 后端 `looksLikeDate` 用**锚定文法**覆盖 `2022.03 - 2024.06`、`2022年3月`、`2022年3月至今`、`2022/03`、`*2022 - 2024*`、`2022年3月—2024年6月`；前端按同一规则镜像（不变量由下面的 parity 测试保证） |
| 6 技能识别 | 技能改由**显式 `kind`** 判定（后端给出），不再看标题 |

#### 三个"顺带发现"的真实缺陷（parity 测试抓到的）

写了跨语言 parity 测试之后，它一次就抓出前端解析器三处与后端的**既有分歧**——都是"预览看着对、保存后不一样"的静默漂移：

| 分歧 | 旧行为 | 后果 |
|---|---|---|
| `### 工程师 \| 公司 \| 部门` | 只取 `parts[1]` | 副标题被截断成"公司"，"部门"丢失 |
| `### 后端工程师 \| 某某科技 \| 2021.03 - 至今` | 不识别标题上的日期 | 日期留在 subtitle，雇主位置显示成日期 |
| 无 `###` 时的 `*2022.03 - 2024.06*` | 落到 `contentBuffer` | `content` 里出现裸 `*2022.03 …*`；**在技能章节会被 `SplitSkillList` 切成名为"2022.03"的技能** |

前两条修在前端。第三条**修在后端**（`stripDateOnlyLines`：无主日期行不进 `content`）——它属于"解析视图的归一化"，不是对文档的修改；一旦出现 `###`，该日期仍会被读进 `Date`。

#### 关键设计：让"允许的重复"变成"被验证的不变量"

ADR-0003 允许两份解析器共存（编辑器要即时预览，不能每键往返）。但重复的解析器**必然漂移**，而且这里的漂移是隐形的。于是：

- **新增** `kratos-server/cmd/resumefixtures`：把后端解析器对一份固定语料（22 篇文档，每篇注明"钉住哪条规则"）的输出 dump 成 JSON。
- **新增** `src/lib/__fixtures__/server-parser.json`（12 KB，纳入版本控制）与其消费者 `src/lib/resume-parser-parity.test.ts`：**用前端解析器重放同一批文档，逐字段比对**，不一致就报出"哪篇文档、哪个字段、两端各是什么"。

这条测试现在是两侧改动的**唯一**防漂移机制：改任一侧的规则而另一侧没跟上，它会失败。上面第三个分歧就是它抓到的。重新生成：`go run ./cmd/resumefixtures > ../my-dashboard/src/lib/__fixtures__/server-parser.json`。

#### 验证

**真实 HTTP + 真实后端**（临时库 `resume_vault_t18b`、端口 20003、独立 config；**未触碰** 30002 / 20002 / PID 26524）。CRLF 文档，含全部边界：

| 端点 | 结果 |
|---|---|
| `GET /api/resumes/by-slug/…` | keys = `resume, markdown, permissions, content`；**6 个章节**全部正确 |
| `PUT /api/resumes/{id}` | keys = `resume, markdown, content`；content 6 章节 ✅ |
| `PATCH /api/resumes/{id}/metadata` | keys = `resume, markdown, content`；`location` 成功写成"上海"✅ |

快照实测输出（即客户端收到的形状）：`关于我`=summary、`工作经历`=experience（`2022年3月至今` / `2019.07 - 2021.02`）、`教育经历`=education（`2022/03`）、`专业技能`=skills（content=`Go、PostgreSQL、Kubernetes、Redis`）、`项目经历`=projects、`获奖情况`=other；标题上的日期正确落到 `date`；副标题 `公司 | 部门` 未被截断。

测试与门禁：

| 项 | 结果 |
|---|---|
| 前端 `npm run test` | **17 文件，552 passed \| 3 expected fail（555）**；本轮 +58 用例 |
| 前端 `npx tsc --noEmit` | 0 |
| 前端 `npm run build` | 成功（与用户的 dev server 并行，未干扰） |
| 前端 `npx eslint .` | **14 errors / 14 warnings，与基线完全一致** |
| 后端 `go build ./...` / `go vet` | 0 / 0 |
| 后端 `go test ./internal/... -count=1` | 全部 ok（`T17_TEST_DSN` + `MIGRATE_TEST_DSN` 已设，无 SKIP） |
| 后端 gofmt（CRLF 安全） | clean；BOM/U+FFFD 均无 |

RED 阶段已确认：`structured_test.go` 先以 `undefined: ParseStructuredContent` 等失败；parity 测试先以 3 个真实分歧失败。

#### 收尾

临时库 `resume_vault_t18b` 已 drop；scratch 后端已停（端口 20003 释放）；scratch 目录已删；repo 的 `data/resumes` 无残留。生产库验证未受影响：1 篇简历、无 `schema_migrations`。30002/20002 仍在监听，PID 26524 存活。

#### 仍未做 / 已记录

- **`readSSEStream` 三处重复**（`ResumeBuilderPage` / `AIUpload` / `AISectionChat`）：工单备注说可顺手做或单独开单，**本次未做**（与解析权威性无关，且三处的错误处理略有差异，改动面比看起来大）。
- 详情页**无限重渲染**既有缺陷仍未修（见任务 1 一节的对照实验），建议单独开单。
- `ResumeEditor` 的 `frontmatter` 死代码：仍未删（任务 3 已不再需要它，但它牵动 `editableToMarkdown` 调用点）。
- `structured.go` 的 `Kind` 用 **string 而非 enum**：新服务端新增类别时，旧前端必须降级为"平铺渲染"而不是解码失败；前端 `sectionKindFromWire` 会把不认识的 wire 值丢掉并回退本地分类。


