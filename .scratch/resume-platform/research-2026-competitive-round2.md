# 简历产品竞品研究（第二轮）— 新增功能与优化机会

> 本轮**不重复**第一轮已覆盖的内容（PDF 管线、模板=渲染器+样式令牌、展示状态 JSONB、ATS 体检"只给事实不给分"、版本历史+乐观锁、中文市场字段、AI 诊断/匹配/配额、seo/分享/统计、MCP server、JSON Resume 适配、pg_trgm 等）。
> 下文每条都标注**证据等级**（见第 5 节）与**构建成本**。凡无法核实的一律写明，不填补。

**成本口径**（按本项目实际形态估算，单人当量；若某条的"隐藏成本"未计入会单独说明）：
- **小 (S)** ≈ 1–3 天。单表/单端点/单组件，不改既有查询与写入路径。
- **中 (M)** ≈ 1–2 周。新增表 + 迁移 + 若干端点 + UI，且需要改动**已有**的读写路径或加一个后台作业。
- **大 (L)** ≈ 3 周以上，或横切多个既有子系统（渲染管线、全量列表/查询过滤、导出矩阵、权限模型）。

> **必须计入的隐藏成本（本轮经核对后被上调的项）**：凡涉及"新增一个文档状态位"（软删除、锁定）的条目，真正的工作量不在加字段，而在**既有的每一个列表查询、查找、导出、分享、agent 写入路径都要处理这个新状态**，外加保留/清理作业。本项目已有版本化 migrator 与多处 list 查询，因此这类条目**不能按"小"排期**。涉及项：#12（锁定）、#13（回收站）。

**本轮最重要的三个结论（先说）**

1. **智能体接口（agent interface）已成为移动最快的新类别**，且门槛已经从"有 MCP server"上移到"**可安全地做局部编辑 + 工具安全语义 + 浏览器内智能体**"。[Reactive Resume 的 MCP/REST 对齐](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v5.2.2) 是当前最完整的公开参考实现。
2. **ATS 检查器正在变成免费获客渠道**，且其"公开版可给分、产品内版不给分"的**双轨做法**，可能让我们在不违反 ADR-0005 的前提下拿到这条渠道。见"能立刻加入的功能"#8、第 4 节。
3. **求职正在从"做一份文档"变成"跑一条有排程的流水线"**：服务端定时发现职位 → 审核收件箱 → 跟踪 → 面试准备 → 复盘 → 谈 offer，全在一个账户里串起来。这是**类别级**差异，不是变体。

---

## 0. 排期一览（每条都有归类与成本，便于直接切成工单）

**第 1 节 — 新功能**

| # | 名称 | 定位 | 成本 |
|---|---|---|---|
| 1 | 职业知识账本（Facts / 故事库） | 差异化 | 中 (M) |
| 2 | 事实治理层（来源/更正/记忆开关/作用域） | 差异化 | 小—中 (S–M) |
| 3 | Agent-ready API：JSON Patch + 期望版本 | 正在变 table-stakes | 中 (M) |
| 4 | 工具安全语义（read-only / consequential / untrusted） | 正在变 table-stakes（有规范背书） | 小 (S) |
| 5 | 浏览器内智能体面（WebMCP） | 早期差异化（建议 feature flag） | 中 (M) |
| 6 | 可安装的智能体技能包（SKILL.md） | 差异化（**性价比最高**） | 小 (S) |
| 7 | 职位发现排程 + 审核收件箱 | 差异化 | **大 (L)**（建议拆两步：先 M） |
| 8 | 免登录公开 ATS 检查器 | 正在变 table-stakes | 中 (M) |
| 9 | 单次申请工作区（Fit/Apply/Prepare/Debrief） | 差异化 | 中 (M) |
| 10 | 语音模拟面试 + 逐题维度评分 | 正在变 table-stakes | 中—大 (M–L)（打字版可降为 M） |
| 11 | Offer 解码与多 offer 对比 | 差异化 | 中—大 (M–L)（多币种/税务/国家差异是主要变数） |
| 12 | 文档锁定（第三种状态） | 正在变 table-stakes | **中 (M)**（原判小，已上调） |
| 13 | 回收站 + 公开链接软跳转 | table-stakes | **中—大 (M–L)**（原判小，已上调；**软跳转可单独先做，小**） |
| 14 | 简历私有备注 | 差异化（成本极低） | 小 (S) |
| 15 | 无 AI 的浏览器内 PDF 导入 | 差异化（成本结构优势） | 小 (S) |
| 16 | 免账户分享查看体验（访客权限） | table-stakes | 小—中 (S–M) |

**第 2 节 — 优化项（均为对已有能力的改进，定位多为"体验债"，不单列差异化）**

| # | 名称 | 成本 |
|---|---|---|
| 1 | 编辑器按意图拆分模式（Write/Design/Check） | 中 (M) |
| 2 | 预览与下载共用同一渲染引擎 | **大 (L)**（收债，非加功能） |
| 3 | 模板画廊：用自己内容预览 + 无损试穿 | 中 (M) |
| 4 | 排版可精确定义 + 对比度检查 | 小—中 (S–M) |
| 5 | 一键塞进一页：报告改动 + 区分隐藏/删除 | 小 (S) |
| 6 | 版本历史按类型区分 + "Before restore" 安全网 | 小—中 (S–M) |
| 7 | 公开页移动重排 + 按天统计与去重规则 | 小 (S) |
| 8 | 分享面板内置二维码 | 小 (S) |
| 9 | 导出前私密区脱敏（按字段名断言） | 小 (S) |
| 10 | 提案式编辑：校验前置 + 接受后可整体撤销 | 小—中 (S–M) |
| 11 | 章节级评论/审阅（导师与教练场景） | 中 (M) |
| 12 | "选择样本文件"解决空状态 | 小 (S) |
| 13 | 自动保存可见反馈 + 离线能力边界声明 | 小 (S) |
| 14 | 尊重 `prefers-reduced-motion` | 小 (S) |

**若只能做三件**：第 3 项（JSON Patch，解锁 4/5/6 并保护既有乐观锁）→ 第 8 项（公开 ATS 检查器，**只给类别结论以守住 ADR-0005**）→ 第 2 项事实治理层（把"只给事实"从 ATS 报告扩展到全部 AI 功能）。

---

## 1. 能立刻加入的功能

### 1. 职业知识账本（Facts / 故事库）— 一次填写，处处复用
**是什么**：把"事实"与"故事"做成独立于任何一份简历的账户级资产。事实（Fact）有四种类型（成就/经历/技能/偏好）并带来源；故事（Story）是固定五段式：Situation / Task / Action / Result / **Reflection**（反思）。故事通过 `Backed by` 关联到具体事实。同一批事实与故事被复用于：申请表单答案、面试准备、模拟面试、AI 教练上下文。
**谁在做**：Reactive Resume（v6，`Career → Knowledge`）。见 [Tell your story once](https://docs.rxresu.me/guides/building-career-knowledge.md)。Rezi、Huntr 只有"多版本简历 + 关键词"，没有独立于文档的知识层。
**为什么对我们重要**：目前我们的 AI 能力是**面向单份文档**的（诊断 analyze / 匹配 match / 提案式改写）。每一次申请都要重新让模型从简历正文里"重新发现"用户的成就，既贵又不稳定。知识账本把这层抽出来，直接降低每次 AI 调用的输入成本，并让"申请表单答案"和"面试"这两块新功能有了共同底座——否则每加一个新场景就要重建一次抽取逻辑。
**成本**：中（两张表 + 关联表 + CRUD + 在 AI 调用里注入上下文；不涉及渲染管线）。
**定位**：**差异化**（目前只有一家开源产品在做，且未在中文市场出现）。

### 2. 事实治理层：来源、更正历史、记忆开关、作用域
**是什么**：每一条事实带 `Source`（这条断言从哪来，用户自己写的不会被应用"独立核实"）；可 `Correct`（旧文本进更正历史，且**联动标记引用它的故事为待复核**）；`Used in coaching` 开关（保留事实但排除出新 AI 上下文）；`Forget`（删除事实与证据链，6 秒撤销窗口）；对照 AI 记忆提供三档：**Ask first（默认）/ Automatically / Never**；作用域区分"仅此公司"与"全部申请"。另外：`Result` 段允许留空——**没有可支撑数据就不写数字**；练习答案不会被记成职业事实。
**谁在做**：Reactive Resume。见 [同页](https://docs.rxresu.me/guides/building-career-knowledge.md)。Enhancv 只在营销页强调"humanize AI resume / 去掉 AI 味"，[feature 页](https://enhancv.com/features/humanize-your-ai-resume/) 没有任何来源或更正机制。
**为什么对我们重要**：这是"AI 生成内容可信度"这一 2026 新轴的**工程化实现**。我们的提案式编辑已有 diff + 逐行接受，但**没有被接受的编辑记录为可追溯事实**。加上这层后，"这条简历里的数字是不是用户说的"变成可回答的问题——这同时是合规卖点和防幻觉的机制,而不是一句口号。
**成本**：小—中（在 #1 之上加字段与几个动作；关键是"更正联动标记故事"这条规则要有测试钉住）。
**定位**：**差异化**。在中文市场（国企/事业单位对履历真实性更敏感）是直接卖点。

### 3. Agent-ready API：JSON Patch + 期望版本 + 失败即不改
**是什么**：对外暴露两条并行的接口面——REST 与 MCP 工具**功能对齐**；编辑走 **JSON Patch（RFC 6902）**：只改单个字段，不用回传整份文档，从而**不会覆盖并发的人工编辑**；所有写操作带 expected revision；补丁**要么全部生效要么全部不生效（原子）**；**不存在的路径或非法的操作**会让补丁不改动任何内容，并把出错路径回给 agent 让它重试。注意区分：**"路径不存在/操作非法"是已明确记载的；"整份文档 schema 校验"在这份文档里没有明确承诺**——不要照抄一个未经证实的保证。
**谁在做**：Reactive Resume。见 [Using the patch API](https://docs.rxresu.me/guides/using-the-patch-api.md)、[v5.2.2 release](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v5.2.2)。
**为什么对我们重要**：我们已有 MCP server 和 409 乐观锁，但**缺 Patch 这一层**。没有它，任何 agent 或第三方集成只能整份 PUT——这恰好会打掉我们引以为傲的乐观锁（agent 的整份写入必然覆盖用户刚打的字）。#4、#5 都建在这一层之上。
**成本**：中（一个 patch 路由 + JSON Schema 校验 + 复用既有乐观锁；测试重点是"部分失败不留痕"）。
**定位**：**正在变成 table-stakes**（有 MCP 之后，集成方第一件事就是问能不能增量写）。

### 4. 工具安全语义：read-only / consequential / untrusted-content 标注
**是什么**：MCP 工具元数据里明确区分**安全读、可变写、破坏性操作、AI 驱动工作流**；工具返回的文档文本被标注为"**供阅读的内容，而非要遵循的指令**"（防提示注入）；破坏性/分享/加锁类能力**不暴露**给 agent；锁定的文档对 agent 只读。
**谁在做**：Reactive Resume 的 MCP 元数据改进（[v5.2.2](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v5.2.2)）与 [WebMCP 指南](https://docs.rxresu.me/guides/using-webmcp.md)；W3C WebMCP 草案把 `read-only hint` / `untrusted content hint` / `consequential hint` 直接写进规范（[§3 Supporting concepts](https://webmachinelearning.github.io/webmcp/)）。
**为什么对我们重要**：这不是"安全加分项"，而是**规范正在收敛的方向**。一旦浏览器内置智能体普及，未标注的工具会被客户端降级或拒绝执行——现在补成本近乎为零（改元数据），以后补要重构工具设计。
**成本**：小（元数据 + 一份工具能力矩阵文档 + 测试断言"破坏性工具不在列表里"）。
**定位**：**正在成为 table-stakes**（有规范背书）。

### 5. 浏览器内智能体面（WebMCP）：在用户已登录的标签页里工作
**是什么**：网页自己向浏览器内置 agent 暴露工具。关键设计取舍：**不需要额外登录**（用当前标签页的会话）、**在用户眼前改**（每次改动在页面上呈现为一步可撤销的操作）、**范围受限**（不能删除/分享/加锁/改账户设置）、页面关闭即失效。与后端 MCP 的分工被明确写成对照表。
**谁在做**：Reactive Resume 是已知最早公开实现者之一（[指南](https://docs.rxresu.me/guides/using-webmcp.md)）；规范本身为 W3C Web Machine Learning CG 草案（2026-10-13，[webmachinelearning.github.io/webmcp](https://webmachinelearning.github.io/webmcp/)）。
**为什么对我们重要**：后端 MCP 解决"agent 在别处"，WebMCP 解决"**agent 在用户眼皮底下、用用户自己的会话、改动即时可见可撤**"——对我们的提案式编辑（diff + 逐行接受）是天然的延伸，而不是另起一套。而且它复用现有前端逻辑，不需要新的鉴权体系。
**成本**：中（注册工具 + 把现有编辑动作包装为工具 + 撤销栈对接）。风险：WebMCP 仍不稳定，Chrome 需 `chrome://flags/#enable-webmcp-testing`。
**定位**：**早期差异化**，但建议以 feature flag 形式做，不要押注。

### 6. 可安装的"智能体技能包"（SKILL.md 分发）
**是什么**：把领域工作流写成 8 个可安装技能：简历构建、内容取舍、要点写作、按 JD 定制、申请管理、面试准备、模拟面试、offer 谈判。一个 `SKILL.md` + 按需读取的 `references/`；可经 `npx skills add` 分发，或作为插件一次装齐（`claude plugin install reactive-resume --marketplace ...`）；**没有账户也能用**（纯文本进、JSON/Markdown 出），接了 MCP 才能读写账户。同一套技能还向 Claude/Codex/Cursor/Copilot/Gemini CLI/opencode 跨客户端分发。
**谁在做**：Reactive Resume（[Using agent skills](https://docs.rxresu.me/guides/using-agent-skills.md)）；同类有第三方 [offer-toolkit-skill](https://github.com/yanliudesign/offer-toolkit-skill)、[resume-tailor-mcp](https://pypi.org/project/resume-tailor-mcp/0.1.0/)、[resume-forge-mcp](https://pypi.org/project/resume-forge-mcp/0.3.4/)。
**为什么对我们重要**：这是**零边际成本的分发渠道**——技能在别人的 agent 里运行，由用户的模型付费，我们只提供领域知识与数据入口。产品没有被"绕过"，反而获得了入口；而且这是**内容资产**，不是基础设施。
**成本**：小（写 Markdown，不写代码）。真正的工作量是内容质量与"不编造事实"的约束写法。
**定位**：**差异化**（且成本极低，性价比最高的一条）。

### 7. 职位发现的"排程 + 审核收件箱"（后台作业，非即时匹配）
**是什么**：用户一次性设定搜索（角色/地点/最低薪资/每周最多到岗天数/通知期），选择 `每天 / 每 3 天 / 每周` 与首次运行时间；**服务端在浏览器关闭时照常运行**；结果进入 `Today → Needs you` 审核队列。三个值得抄的工程细节：① 逐条**校验搜索结果确实是"单个在招职位"**，识别已关闭职位并跳过不确定结果；② 未跟踪的职位**一周后复查**，描述变化或已关闭则更新原条目而**不重复提示**；③ 匹配标签**显式呈现未知**——"Salary not listed" / "Office days not stated" 是"需要去核实的问题"，而不是"偏好已满足"。用户动作只有三个：读职位 / 加入跟踪 / 不适合（可撤销）。
**谁在做**：Reactive Resume（[Find roles while you are busy](https://docs.rxresu.me/guides/finding-roles-automatically.md)）。Rezi 与 Enhancv 提供 job search / AI job board，但**未发现服务端排程与关闭职位识别**（Rezi 见[其功能列表](https://www.rezi.ai/posts/what-is-rezi)；Enhancv 见 [AI Job Board](https://enhancv.com/features/ai-job-application-tracker-chrome-extension/)）。
**为什么对我们重要**：我们的 `match` 是**按需、按单份文书**的。排程发现是**常驻、按求职者意图**的——它把产品的使用频率从"改简历时"提升到"每个工作日早晨"，这是留存结构的变化。关键学习点其实不是抓取，而是 **"未知就是未知"的呈现纪律**，这与我们 ATS 报告"只给事实"的原则完全同源。
**一条容易忽略的设计约束**：发现功能需要一个**独立的"网页搜索连接"**，它与"AI 文本辅导连接"**分开配置**，而且**只排程一次发现搜索并不需要 AI**。这个解耦很关键——它让发现功能可以在**用户没配 AI / 没买 AI 配额**的情况下工作，也让搜索 provider 可以单独替换或按量计费（文档亦提示搜索服务可能收费）。
**成本**：**大 (L)**（排程器 + 队列 + 关闭/重复识别 + 审核 UI + 独立的搜索 provider 抽象）。**建议拆两步**：先做"粘贴职位链接入队 + 每周复查 + 审核收件箱"（中），把抓取后置为可插拔 provider；只有在第一步证明有留存价值后再做全自动抓取。
**定位**：**差异化**（中文市场的校招日历/名企热招是同类需求，但形态是列表而非个人化排程）。

### 8. 免登录、不上传的**公开 ATS 检查器**（获客闭环）
**是什么**：`/ats-checker` 独立页面：无需账户、PDF 最高 25 MB、**完全在浏览器内解析，文件不上传不存储**、按客户端限速、只查前 30 页并明说截断。输出：0–100 分 + 三档结论（Reads cleanly ≥80 / Mostly readable 50–79 / Hard for software to read <50），五个计分类别（可读性 / 版面 / 章节 / 联系方式 / 日期），**阻塞性问题封顶总分**；另有一类**不计分**的写作建议。同时明确写"没有任何工具能判断你会不会被拒"。
**最关键的设计是转化路径**：报告里给 "Fix these in the editor" → **在浏览器内把同一个文件导入成一份新简历，未登录则先注册，文件在浏览器里等着，回来即导入后即销毁**。
**谁在做**：Reactive Resume（[Checking any resume PDF with the ATS checker](https://docs.rxresu.me/guides/using-the-ats-checker.md)）。Resume.io 也把 AI ATS checker 做成免费入口（[官方更新日志 2025-05](https://updates.resume.io/)）。
**为什么对我们重要**：我们**已有全部零件**（PDF 文字层断言、解析器视角预览、规则化报告、`verify:ats` 门禁），但它们是**登录后**的能力。把它拆出一个免登录页面，就得到一个**可被搜索引擎收录、可被分享、可被 HR 社群转发**的入口——这比再做十个模板更有增长杠杆。
**成本**：中（页面 + 浏览器内 PDF 解析 + **用户上传的文件必须真的不上传**，这需要一条可验证的测试）。
**定位**：**正在成为 table-stakes**（Resume.io、Reactive Resume 都已提供免费公开检查器）。
**⚠️ 与 ADR-0005 的冲突必须显式决策 —— 但冲突比初看小得多。**
关键细节（已核实并复核）：**写作建议那一类明确不计分**（文档原话 "never affect the score"），且文档自己写明 "**The score reflects how reliably text comes out of the file, not your chances of getting the job.**"
这两处豁免正是本项目 ADR-0005 所要求的**分离**。因此该分数应当被理解为"**文本可抽取性事实的汇总**"，而不是"内容质量评分"——它与我们"只给事实"的精神并不敌对，区别只在于**要不要把事实压成一个数字**。
**建议**：产品内维持事实-only；公开检查器**优先**采用类别结论（可读/勉强可读/难以读取）+ 逐条具名问题，不在产品内引入合成分数。**若**决定公开版给分，需满足三个条件并在 ADR 里写清楚：① 明确它是可抽取性汇总而非成功率预测（照抄上面那句免责）；② 计分项与不计分项严格分离，且不计分项永不进入分数；③ 同步更新 ADR-0005 与 `verify:ats` 的字段名断言。**绝不能让新功能悄悄绕过门禁。**

### 9. 单次申请的工作区（Fit → 表单答案 → 面试 → 复盘）
**是什么**：把"一份简历 + 一个职位"升格为一个**有生命周期的对象**，内含四个标签页：
- **Fit**：把 JD 要求分类加权，逐条映射到用户证据，给结论标签（Strong / Reasonable stretch / Long shot）；**缺口不编造，而是变成问题（一次最多 5 个）**。
- **Apply**：从知识库草拟表单长答案，**带字数/字符数统计**，并保存"实际提交过什么"。
- **Prepare**：生成分时段的准备计划（时间不够就给一屏小抄）、开场陈述、要讲的两个故事、要问面试官的问题，以及一节 **"Keep it honest"——明确列出哪些主张目前没有证据支撑、该怎么讲**。可为面试当天早上 08:00 排程生成简报。
- **Debrief**：面试后录入问题与自己的回答、自评落地程度，复盘把"**有支撑的主张**"与"**只是观察**"分开标注，并给出下一轮练习优先级。
**谁在做**：Reactive Resume（[Get ready for interview day](https://docs.rxresu.me/guides/preparing-for-interview-day.md)、[Apply when your experience is different](https://docs.rxresu.me/guides/checking-job-fit.md)）。Rezi 有 interview practice 与 job search（[说明](https://www.rezi.ai/posts/what-is-rezi)），Enhancv 有 [Interview Help](https://enhancv.com/features/humanize-your-ai-resume/)。
**为什么对我们重要**：我们的 `analyze`（诊断）与 `match`（匹配）产出的是**一次性报告**，没有承接它的容器。工作区把报告变成流程对象，并让 #1 的知识账本有了落点。其中 **"Keep it honest" 与 "supported vs observation" 的区分**是最值得先抄的一小块——它成本极低，却直接回答"AI 会不会替我说谎"。
**成本**：中（一张 application 表 + 四个页签；Fit 可复用现有 match 逻辑）。Reactive Resume 还单独做了"面试排程 + .ics 导出"与"投递洞察（回复率/用时/漏斗/定制版是否更好）"。
**定位**：**差异化**（中文市场 职徒简历 的"AI 面试押题 + 模拟面试"是同类需求，但没有 Fit/表单答案/复盘这条链路）。

### 10. 语音模拟面试：转写 + 逐题维度评分 + 竞争力模型对照
**是什么**：选轮次（HR 初筛 / 用人经理 / 行为面 / coding / 系统设计 / case / 产品 sense / panel）、面试官风格、难度 1–3，以及两种模式：**coach（每题后反馈并可重试）** 与 **realistic（仅结束时反馈）**。一次只问一题，对含糊回答追问，按结构、具体性、归属感（是不是"我做的"）、结果、相关性、长度六个维度给 1–4 分并**引用用户原话作为证据**。支持语音朗读题目与录音转写（朗读/转写/评审可以是三个不同的连接），无语音服务时回退浏览器语音，也可选择打字。**明确声明"练习是模拟，不构成雇主会问什么的预测"**，并且**不在真实面试中提词**（除非用户确认雇主允许 AI 辅助）。
**谁在做**：Reactive Resume（[同页](https://docs.rxresu.me/guides/preparing-for-interview-day.md)）；职徒简历（52cv）官方 App 描述含"**AI 面试押题精准匹配岗位…AI 模拟面试支持中英双语，实时互动，生成综合性面试报告**"（[App Store 页面](https://apps.apple.com/cn/app/id1524420173)）；Rezi 有 AI Interview（[说明](https://www.rezi.ai/posts/what-is-rezi)）。
**为什么对我们重要**：这是上一轮完全没覆盖的**新功能类别**，而且我们的 AI 已经在读同一份简历与 JD——把它从"写"扩到"说"是复用而非新建。中文市场的双语要求正好匹配我们已有的中英双语资产。
**成本**：中—大（语音输入/输出 + 评分 rubric 的稳定性 + 会话状态）。若只做打字版可先降到**中**。
**定位**：**正在成为 table-stakes**（国内外都已有多家；Rezi/职徒/Enhancv/专门的面试产品都在做）。

### 11. Offer 解码与多 offer 对比
**是什么**：把 offer 逐项拆解（基本工资 / 奖金 / 股权 / 签字费 / 职级 / 条款），每项标注 **guaranteed / conditional / estimate / unknown**；**不做单一膨胀总额**，而是分开呈现"第一年现金 / 四年基本工资 / 不确定部分"；多 offer **各自保留原币种**。再基于可核查的薪酬数据设目标与底线，找真实的谈判杠杆，草拟一份 counter（邮件版 + 电话话术版），并能扮演 recruiter 排练。覆盖"你的薪资期望是多少"、截止日期与延期、"best and final"、竞品 offer、反报价，以及国家差异（如印度的 CTC、13 薪、公务员工资表）。
**谁在做**：Reactive Resume（[Using agent skills → offer-negotiation](https://docs.rxresu.me/guides/using-agent-skills.md)）；第三方 [ResumeGuru 的 Salary and offer analysis](https://www.resumeguru.ai/docs/job-search/salary-and-offer-analysis)。
**为什么对我们重要**：这是求职链路的**最后一段**，也是唯一一段用户愿意付费的环节（决策后果最重）。把"unknown 就标 unknown、不合成一个好看的总数"搬过来，与我们的产品性格一致。
**成本**：中（数据模型 + 计算 + 文案；薪酬数据源可后置，先做"用户自己填市场区间"）。
**定位**：**差异化**。

### 12. 文档锁定（第三种状态）
**是什么**：给简历/求职信一个**锁定**状态：锁定后**不能编辑、不能 patch、不能删除**，甚至**不能修改分享设置**；锁定文档对 agent 也只读（工具会明确拒绝）。目的是保护"已投递/已定稿"的版本不被误改。
**谁在做**：Reactive Resume（[Managing your documents](https://docs.rxresu.me/llms.txt)、[Set resume lock status API](https://docs.rxresu.me/llms.txt)）。
**为什么对我们重要**：我们只有"存在/归档"。用户投完一家后的真实心智是"**这版冻结了**"。这个状态同时是 agent 安全边界（#4）和版本可信度（"我投出去的就是这个"）的基础；实现成本极低但语义价值高。
**成本**：**中 (M)**，且**不是"小"**。隐藏成本：锁定语义必须被**每一条写入路径**尊重——编辑器保存、Patch API、MCP/agent 工具、自动保存、版本回滚、分享设置——漏掉任何一条，锁定就形同虚设并成为数据完整性 bug。每一条都需要一条"锁定后拒绝"的测试。仅"能锁/能解"这一步确实是小，但可用的锁定是中。
**定位**：**正在成为 table-stakes**。

### 13. 可恢复回收站（30 天）+ 公开链接软跳转
**是什么**：删除 = 进回收站，保留 **30 天**，期间可恢复，或立即永久删除；**进回收站的简历其公开链接立即失效**；锁定文档不能进回收站。配套两个链接可靠性细节：
- **改名软跳转**：改公开地址后，**旧地址在 30 天内仍能到达**（响应里带当前 slug，客户端可跳转），这样已经发出去的链接不会立刻死掉。
- **改用户名则所有公开地址一次性变更、旧链接立即失效**——这一点被**明确写出来告知用户**。
**谁在做**：Reactive Resume（[Using the Trash](https://docs.rxresu.me/llms.txt)、[Sharing your resume with a link](https://docs.rxresu.me/guides/sharing-your-resume-publicly.md)、[Get public resume by username and slug](https://docs.rxresu.me/llms.txt)）。
**为什么对我们重要**："链接发出去之后才知道要改简历"是这类产品最常见的投诉来源。软跳转是一个**极小改动、极大体感**的修复；我们已有分享链接与统计，缺的只是旧 slug 的保留表。
**成本**：**中—大 (M–L)，原判"小"是错的**。隐藏成本（已对照本项目代码核实）：当前实现是**硬删除**，模型层没有 `deleted_at`，`Delete` 直接落库删除。改成软删除意味着**每一个列表查询、查找、导出、分享链接解析都要加过滤条件**，还要一个保留期清理作业，以及"进回收站后公开链接立即失效"的联动。这不是加字段，是横切。
**建议**：**先只做软跳转那一半**（旧 slug 保留表 + 响应带当前 slug），它独立、小、且直接解决用户最痛的点；回收站单独作为一条 M–L 工单排期，不要和软跳转捆在一起。
**定位**：**table-stakes**（缺失会被当作缺陷而非功能缺失）。

### 14. 简历私有备注（Private notes）
**是什么**：每份简历有一个**不进正文**的备注区（富文本 + Markdown 快捷输入，自动保存），用来记"投给了谁、recruiter 是谁、这版针对什么改了"。明确列出**不会**出现的位置：页面预览、PDF、DOCX、Markdown 导出、他人看到的公开页。也明确列出**会**包含它的位置：**JSON 导出**（完整副本，含备注）、**历史版本**（恢复版本会连备注一起恢复）。求职信没有备注区；每条申请有自己的备注。
**谁在做**：Reactive Resume（[Using private notes](https://docs.rxresu.me/guides/using-private-notes.md)）。
**为什么对我们重要**：用户现在只能把这信息塞进简历里（不能投出去）或塞进外部笔记（会丢）。它是**零风险的留存特性**，也是"投递与简历的关联"最自然的载体。关键是那份"会/不会包含备注"的清单必须有测试钉住——否则私有备注会从 JSON 导出泄漏。
**成本**：小。
**定位**：**差异化**（成本极低）。

### 15. 无 AI 的浏览器内简历导入（PDF / 求职信）
**是什么**：**在浏览器里用 PDF 文字层直接解析**并生成可编辑简历，**不调用 AI**；另设 AI 辅助的 PDF/Word 导入端点。LinkedIn 官方数据导出包也可导入（**不使用 AI**）。
**谁在做**：Reactive Resume（[Importing a resume](https://docs.rxresu.me/guides/importing-resumes.md)：从 PDF / Word / LinkedIn 导出 / JSON Resume / Reactive Resume JSON 转为可编辑文档）。**关键区别**（已在 API 文档原文核实）：[Import a PDF, resume JSON or LinkedIn archive](https://docs.rxresu.me/api-reference/resumes/import-a-pdf-resume-json-or-linkedin-archive.md) 明确写着 "**PDF imports read the text layer without AI.**"，而 AI 辅助的 PDF/Word 导入走另一组 parsing 端点。Resume.io 则把"上传旧简历 → AI 重排进模板"放在首页作为主入口（[更新日志 2025-03](https://updates.resume.io/)）。
**为什么对我们重要**：我们的 AI 有配额与计费表——**每次导入都烧配额**，而导入是**漏斗第一步**，也是最容易被滥用（刷免费额度）的一步。把常见路径（有文字层的 PDF）改为**确定性解析、零 AI 成本**，只在解析失败或用户主动要求时才走 AI：既省成本，又提高导入成功率与可预测性。这与我们"PDF 文字层断言"的既有投入完美衔接。
**成本**：**小 (S)**。既有 PDF 文字层解析模块已存在（本项目有 `pdf-fixtures.ts` 与文字层断言），主要工作是把常见路径改为**确定性解析、零 AI 调用**，并保证失败时才升级到 AI 解析端点。
**定位**：**差异化**（成本结构优势，不是用户可见功能）。

### 16. 免账户的分享查看体验（含访客权限与隐私默认值）
**是什么**：公开链接**默认关闭**；打开后可选 **"访客可下载 PDF"**（默认开；关掉后**同时禁止打印**）；访客看到的是**无产品菜单的干净页面**，桌面端顶部只有姓名/标题/地点 + Copy link + Download PDF；**手机端重排为可读文本流**（顺序与页面一致）并底部常驻下载与分享。密码保护：6–64 字符，解锁后**约 10 分钟**失效；**链接关闭或进回收站时，访客只看到中性文案，不泄漏任何信息**；**公开页不被搜索引擎收录**；访客**永远看不到私有备注与被隐藏的章节**。
**谁在做**：Reactive Resume（[Sharing your resume with a link](https://docs.rxresu.me/guides/sharing-your-resume-publicly.md)）。国内对照：五百丁在编辑器里提供"简历访问权限：所有人可访问 / **密码访问** / **仅自己**"三档（[编辑器页面](https://www.500d.me/cvresume/edit/)）。
**为什么对我们重要**：我们已有分享链接保护 + 过期，但**缺访客端的阅读体验与权限细分**。"访客可下载/可打印"开关是一个**真实存在的用户诉求**（给猎头看但不想留档）；手机端文本重排则直接影响"HR 在微信里点开"的转化——这是中文场景的高频路径。
**成本**：小—中。
**定位**：**table-stakes**。

> **同类但本轮不单列（证据偏弱或与 #7/#9 重叠）**：投递看板/表格/日历三视图、CSV 导入导出、`.ics` 面试日历导出、投递洞察（回复率/漏斗/定制版是否更有效）、职位链接自动填充表单。Reactive Resume 均已提供（参见 [llms.txt 索引](https://docs.rxresu.me/llms.txt)、[Viewing application insights](https://docs.rxresu.me/llms.txt)）；国内五百丁有"求职管理"投递记录（[同上](https://www.500d.me/cvresume/edit/)）。建议并入 #9 一次性规划，避免碎片化。

---

## 2. 优化项（针对上一轮**已有**能力的改进）

1. **编辑器按意图拆分模式，而不是一屏堆控制**（Write / Design / Check）。Reactive Resume v6 把它作为主要卖点；移动端对应四个页签（Write / Page / Design / Check）、全屏条目、设计抽屉。对我们的意义：我们的展示状态（强调色/字体/字号/行高/页边距/照片）目前是并列设置项，用户不知道该先动哪个；"模式"给出**顺序**，也天然解决移动端拥挤。成本：中。证据：[What's new in v6](https://docs.rxresu.me/guides/whats-new-in-v6.md)、[Editing on mobile](https://docs.rxresu.me/llms.txt)。

2. **预览与下载共用同一渲染引擎**。Reactive Resume v6 用新引擎 Forme，**同一引擎在浏览器与服务端渲染预览与下载**，并宣称改进 Unicode、连字、分页与**语言感知断词**。对我们的意义：我们已用"浏览器打印 + headless Chromium"，但仍存在预览与 PDF 漂移的风险（AGENTS.md 里工单 20 的分页静默失效就是这类漂移的样本）。把"预览即下载"变成可断言的**同一引擎约束**，比继续加测试更根本。成本：大（但这是收债，不是加功能）。证据：[v6.0.0 release](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v6.0.0)。

3. **模板画廊：用用户自己的内容预览 + 允许直接试穿而不丢内容**。Reactive Resume v6 的模板页"用你自己的内容绘制"，应用模板**不丢任何已填内容**；官方称 17 个模板。对照之下，Rezi 只列 **Simple / Modern / Compact / Creative 四个**（[模板页](https://www.rezi.ai/posts/what-is-rezi)）。对我们的意义：**模板数量不是竞争轴，试穿体验才是**。我们的画廊已按用途分面 + 可解析性评级，下一步应让缩略图从"示例内容"升级为**用户自己的内容**，并保证切换模板是无损操作。成本：中。证据：[Choosing a template](https://docs.rxresu.me/llms.txt)。

4. **排版控制从"少量预设"扩到"可精确定义"，但保留一键预设入口**。Reactive Resume 提供字体配对 + 字号 + 密度预设，也可展开到**约 500 款字体**并指定精确字号、字重、行高；颜色方面给强调色并**检查对比度**，再暴露正文/背景/技能等级样式。对我们的意义：我们现在只有 font family / font scale / line height。加"对比度检查"是**低成本高价值**（可访问性 + 打印可读性，且可复用我们既有的规则化报告框架）。成本：小—中。证据：[Customizing typography](https://docs.rxresu.me/llms.txt)、[Choosing colors](https://docs.rxresu.me/llms.txt)。

5. **在"一键塞进一页"里明确"未知"与"被隐藏"，而不是静默压缩**。Reactive Resume 的 fit-to-page **不删除内容**；做跨国版本或大幅删减时**优先隐藏条目而不是删除**。对我们的意义：我们已有 one-page auto-shrink。需要补的是**契约**：压缩过程必须报告它动了什么；且"删掉"与"隐藏"要区分（隐藏可逆）。成本：小。证据：[Fitting content on a page](https://docs.rxresu.me/llms.txt)、[resume-content-guide](https://docs.rxresu.me/guides/using-agent-skills.md)。

6. **版本历史按类型区分保留策略，并让"恢复"本身非破坏**。Reactive Resume：版本条目区分**创建/导入、每次编辑会话一条自动保存、命名版本、恢复点、AI 编辑**；自动保存/AI 编辑/恢复点**保留 90 天**，命名版本永久；**恢复前自动把当前状态存为 "Before restore"**，恢复后再生成一个新快照。对我们的意义：我们已有版本历史 + 回滚 + 乐观锁，但**没有区分 AI 编辑与人工编辑，也没有恢复前的安全网**。加上"AI 编辑"这一类型后，#2/#3 的 agent 写入才在历史里可辨识。成本：小—中。证据：[List resume version history](https://docs.rxresu.me/llms.txt)、[Restore a resume version](https://docs.rxresu.me/llms.txt)。

7. **公开页的移动端阅读重排 + 按天统计**。Reactive Resume 公开页手机端**重排为与页面同序的文本流**、底部常驻下载；统计给 **30 天视图/下载总数 + 每 30 天按天的柱状图**，且规则明确：**本人登录后的访问不计、同一访客 1 小时内重复访问计一次、每次完成下载都计、计数完全匿名**。对我们的意义：我们已有 view statistics；缺的是**移动重排**（微信内打开的转化）和**明确的去重/自访问规则**（否则统计数字不可信，用户会质疑）。成本：小。证据：[Sharing your resume with a link](https://docs.rxresu.me/guides/sharing-your-resume-publicly.md)、[Get resume daily statistics](https://docs.rxresu.me/llms.txt)。

8. **分享面板里内置二维码**。Reactive Resume 的 Link 页签直接给 QR code，用于"名片或幻灯片"。对我们的意义：国内线下/宣讲会/纸质名片场景高频，且这是**从线上分享反向打通线下**的最小改动。成本：小。证据：[Sharing your resume with a link](https://docs.rxresu.me/guides/sharing-your-resume-publicly.md)。

9. **导出前的"私密区脱敏"**。Reactive Resume 明确警告 **JSON 导出包含私有备注**，并提示分享前先移除（因为 JSON 是整份副本）。对我们的意义：我们已有 PDF / DOCX / .txt / JSON Resume 适配等多格式导出，**格式越多，泄漏面越大**。需要一条规则：哪些字段进哪些格式，并**用测试钉死**（与 AGENTS.md 里"按字段名断言"的做法一致）。成本：小。证据：[Using private notes](https://docs.rxresu.me/guides/using-private-notes.md)。

10. **提案式编辑要真正"先校验再应用"**。Reactive Resume 的 agent 编辑规则：会导致文档非法的补丁**什么都不改**，并把出错路径回报以便重试；一次补丁 = 一步操作 = 一次撤销；消息里带 **Undo**。对我们的意义：我们已有 diff + 逐行接受。要补的是**校验前置**（非法提案不应进入可接受列表）与**接受后仍可整体撤销**。成本：小—中。证据：[Using WebMCP → How edits work](https://docs.rxresu.me/guides/using-webmcp.md)。

11. **章节级评论/审阅（面向导师与教练场景）**。能在**具体章节**上留评论、回复、**标记已解决**、已解决评论从活动视图消失；评论不出现在导出文件里；仅协作者可见。两家独立实现：Careerflow（[Resume Commenting](https://help.careerflow.ai/en/articles/11827111-using-the-resume-commenting-feature)）；Enhancv（"share your resume and get comments on specific sections from family and friends"，[feature 页](https://enhancv.com/features/humanize-your-ai-resume/)）。对我们的意义：我们已有分享链接与版本历史，评论是把分享从"给别人看"变成"**和别人一起改**"的最小增量；同时也是国内"简历修改服务/导师辅导"（超级简历有[导师辅导](https://www.chaojijianli.com/blog-cv-content/)、职徒有"上百位导师在线简历修改"）的**产品化载体**。成本：中。**归属**：本轮**新增**（上一轮只有 share-link 保护，没有协作）。

12. **用"选择样本文件"解决空状态**。Reactive Resume 的公开检查器在拖放区旁直接给 **"Check a sample file"**。对我们的意义：我们的 ATS 体检、模板画廊、导入流程都有空状态；"载入一个真实样本"比任何文案都更能让人理解产品在做什么，且可复用于测试夹具（与我们 `pdf-fixtures.ts` 的思路一致）。成本：小。证据：[Checking any resume PDF with the ATS checker](https://docs.rxresu.me/guides/using-the-ats-checker.md)。

13. **自动保存要有可见反馈，并在离线时明确禁用危险动作**。Reactive Resume：`Write/Design/Check` 里"未保存的改动留在设备上"；分享与下载**在离线时不可用**（而不是静默失败）。对我们的意义：我们有自动保存 + 409 并发。要补的是**状态可见**（正在保存/已保存/离线待同步）与**离线时的能力边界声明**。成本：小。证据：[What's new in v6](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v6.0.0)、[Sharing your resume with a link](https://docs.rxresu.me/guides/sharing-your-resume-publicly.md)。

14. **可访问性：减少动效等系统级偏好**。Reactive Resume 在"外观与语言"里说明应用如何处理 **reduced motion**，v6 通篇改进 accessibility。对照：已有专门做 **accessibility 声明页**的竞品（如 [ZapResume](https://zapresume.io/accessibility)）；GitHub 上有把 accessibility audit baseline 做成 PR 的实践（[PR #148](https://github.com/kaecyra/resume/pull/148)）。对我们的意义：我们的设计规范大量使用 `duration-500` 长过渡与 framer-motion 弹性动画——**必须尊重 `prefers-reduced-motion`**，否则对前庭敏感用户不友好，且在国内政企/事业单位采购场景会构成门槛。成本：小。**归属**：本轮新增。

---

## 3. 趋势与判断

- **智能体接口的竞争点已从"后端 MCP"上移到"浏览器内 + 安全局部编辑"。** 后端 MCP 已成基础配置（Rezi 有 [Resume MCP](https://www.rezi.ai/resume-mcp)，Reactive Resume 有 [MCP server](https://docs.rxresu.me/guides/using-the-mcp-server.md)）；新的分水岭是 **WebMCP**（浏览器内置 agent，用用户自己的会话，改可见可撤，[指南](https://docs.rxresu.me/guides/using-webmcp.md)）与 **JSON Patch + 期望版本 + 工具安全标注**（[patch API](https://docs.rxresu.me/guides/using-the-patch-api.md)、[v5.2.2](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v5.2.2)）。W3C WebMCP 草案（2026-10-13）把 `read-only` / `untrusted content` / `consequential` 三个标注写进规范——**这是有规范背书的方向，不是某家的产品癖好**（[草案](https://webmachinelearning.github.io/webmcp/)）。
- **求职正在"流水线化"，产品边界从编辑器扩到求职操作系统。** 服务端**排程**职位发现（[Find roles while you are busy](https://docs.rxresu.me/guides/finding-roles-automatically.md)）+ 投递跟踪（看板/表格/洞察/日历）+ 面试排程与 `.ics` + 面试简报 + 复盘 + offer 谈判（[agent skills](https://docs.rxresu.me/guides/using-agent-skills.md)）——这条链路把产品从"改简历时才打开"变成"每个工作日都打开"。国内同向：五百丁有"求职管理/投递记录"（[编辑器](https://www.500d.me/cvresume/edit/)），职徒覆盖"校招日历 + 在线投递 + 面试题库"（[App Store](https://apps.apple.com/cn/app/id1524420173)）。
- **"不编造"正在从宣传语变成可审计的工程机制，这是 2026 的新竞争轴。** Enhancv 用整页营销讲"去掉 AI 味"却只提供实时写作建议（[feature 页](https://enhancv.com/features/humanize-your-ai-resume/)）；Reactive Resume 则把它落成机制：事实带 **Source**、更正进历史并**联动标记故事**、有 `Used in coaching` 与 `Forget`、AI 记忆三档开关、`Result` 段允许留空、面试复盘区分 **supported / observation**、准备简报有一节 **"Keep it honest" 明说哪条主张尚无证据**（[Tell your story once](https://docs.rxresu.me/guides/building-career-knowledge.md)、[Get ready for interview day](https://docs.rxresu.me/guides/preparing-for-interview-day.md)）。对招聘侧的焦虑是真实存在的——LinkedIn 已在做针对 AI 简历的招聘助手（[digit.in 报道](https://www.digit.in/features/general/ai-resumes-are-the-new-headache-linkedins-hiring-assistant-is-trying-to-solve-for.html)），有厂商发布"AI 简历验证危机"报告（[Cadient](https://cadient.ai/article/issuewire-ai-resume-verification-crisis)，**供应商自述，低置信**）。**判断**：可信度机制会成为采购与信任差异点，而且它**恰好与我们既有的 ADR-0005（只给事实、可溯源到具名规则）同源**——我们在这条轴上位置比多数竞品好。
- **ATS 检查器正在变成免费获客渠道，而不是付费功能。** Resume.io 把 AI ATS Checker 做成免费入口（[更新日志 2025-05](https://updates.resume.io/)）；Reactive Resume 的公开检查器**免登录、不上传、任意 PDF 可用**，并把"导入到编辑器修复"作为转化点（[指南](https://docs.rxresu.me/guides/using-the-ats-checker.md)）。**判断**：把已登录能力拆出一个公开版本，是比再做模板更高的增长杠杆；但**是否给分需要与 ADR-0005 显式对齐**（见第 1 节 #8、第 4 节）。
- **模板数量不是竞争轴，"试穿 + 可精确定义 + 渲染一致"才是。** 一边是 Rezi 只用 4 个模板且强调 ATS 解析可靠（[说明](https://www.rezi.ai/posts/what-is-rezi)），另一边是国内平台以万级模板/范文做量（职徒自称"模板总数超过 1 万个、1 万+ 行业案例"，[App Store 自述，低置信](https://apps.apple.com/cn/app/id1524420173)）；Reactive Resume 17 个模板但**用你自己的内容预览、应用不丢内容、可自定义 CSS、预览与下载同一引擎**（[Choosing a template](https://docs.rxresu.me/llms.txt)、[v6.0.0](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v6.0.0)）。**判断**：我们的"用途分面 + 可解析性评级"方向正确；下一步价值在**无损试穿**与**预览=下载**的工程保证，而不是把模板数从 2 提到 40。
- **同一市场正在裂成两种商业模式，且第二种有反噬证据。** 一边是**开源 / 免费无付费墙 / 可自托管 / SSO**（Reactive Resume 明确"no premium tier"、17 模板、MIT、可自托管，[use-cases 索引](https://docs.rxresu.me/llms.txt)）；另一边是**代投递量产**：Resume.io 全球上线 **Auto Apply（替用户投递）** 与 **Resume Distribution（把简历直接发给招聘经理，试用期 50 位 / 月付 200 位）**（[更新日志](https://updates.resume.io/)）。同时已有对"机器人海投反噬"的分析（[ClavePrep](https://claveprep.com/blog/ai-job-application-agents-2026-mass-apply-guide)，**第三方评论，低置信**）。**判断**：我们的"按 JD 定制 + 单版本 + 投递记录"路线属于前者，应刻意与海投保持距离，并把"**我们不替你投递，我们让你投得更准**"作为显式立场。

---

## 4. 明确不推荐 / 已被证伪

1. **不要在产品内引入合成分数（ATS Score）。** 我们的 ADR-0005 禁止任何形式的合成分数，`verify:ats` **按字段名断言**"报告中不得存在任何形式的合成分数"，且每条风险须溯源到具名规则。Reactive Resume 的公开检查器确实给了 0–100 分 + 三档结论（[指南](https://docs.rxresu.me/guides/using-the-ats-checker.md)），**但这不构成推翻 ADR 的理由**——它的分是"文本能否被可靠抽取"，且页面自己也写明"没有任何工具能判断你是否会被拒"。**建议**：产品内维持事实-only；若要公开渠道，只给**类别结论**不给数字。**若最终决定给分，必须同步修改 ADR 与 `verify:ats` 断言**，绝不能让它作为"新增功能"悄悄绕过门禁。
2. **不要做"AI 生成简历检测"。** 目前只有招聘侧厂商的营销性主张（[Cadient 报告，供应商自述](https://cadient.ai/article/issuewire-ai-resume-verification-crisis)）与新闻转述（[digit.in](https://www.digit.in/features/general/ai-resumes-are-the-new-headache-linkedins-hiring-assistant-is-trying-to-solve-for.html)），**我没有找到任何可复现的方法学、基准或误报率数据**。国内同类说法（如"招聘人员 20 秒识别 AI 简历"，[来源](https://www.vietnam.vn/zh-cn/nha-tuyen-dung-chi-can-20-giay-de-nhan-ra-cv-do-ai-viet)，**低置信二手**）同样不可核实。做这个功能等于向用户输出不可验证的判断，与我们"只给事实"的性格直接冲突。**替代方案**：做 #2 的事实治理层（来源 + 更正历史），它提供的是**可核查性**，不是猜测。
3. **不要做简历自动填充浏览器扩展（autofill into ATS forms）。** Huntr 提供 [Job Application Autofill](https://huntr.co/product/job-application-autofill) 与 [Job Clipper 扩展](https://help.huntr.co/en/articles/10477521-what-is-huntr)，Rezi 有[自动填充扩展](https://www.rezi.ai/rezi-chrome-extension)，Teal 亦提供 [Autofill Job Applications](https://www.tealhq.com/tools/autofill-job-applications)（该页被 Cloudflare 拦截，**仅由搜索结果标题与链接佐证，未读到正文**）。**但**：这需要长期维护 Workday / Greenhouse / 各家自建门户的 DOM 适配，**每次 ATS 改版即失效**，属于典型的成本持续上升、收益一次性释放的功能。存在第三方 Firefox 扩展 [Autofill Jobs (Fork)](https://addons.mozilla.org/en-GB/firefox/addon/autofill-jobs-fork/) 说明这个生态本身已碎片化。对我们（小团队、无浏览器扩展经验、主打国内 + 中英双语）**不划算**。**替代方案**：把精力放在 #7 排程发现与 #9 工作区，让用户"少投但投得准"。
4. **不要做 Auto Apply / 代投递 / 简历分发。** Resume.io 已把它做成付费服务（[更新日志](https://updates.resume.io/)），但它与我们"按 JD 定制、可核查"的路线**逻辑相反**；且已有对其反噬的分析（[ClavePrep，低置信](https://claveprep.com/blog/ai-job-application-agents-2026-mass-apply-guide)）。工程上还要承担"代用户投递"的法律与声誉责任。建议**显式反向定位**。
5. **不要把 LinkedIn 导入当卖点。** Reactive Resume 支持导入 LinkedIn 官方导出（**不使用 AI**，[Importing a resume](https://docs.rxresu.me/guides/importing-resumes.md) 与 [API 条目](https://docs.rxresu.me/api-reference/resumes/import-a-pdf-resume-json-or-linkedin-archive.md)；v1 另有一节 [Importing your data from LinkedIn](https://v1docs.rxresume.org/product-guides/importing-your-data-from-linkedin)，**该页我仅取到导航框架、未读到正文，故不引其内容**）。但：① 该导出包的**信息密度低于 PDF 文字层解析**（后者我们已实现并有测试）；② LinkedIn 数据存储在境外、"官方导出"流程繁琐，**对国内用户几乎为零价值**；③ 它绑定一个我们把控不了的第三方格式。**结论**：可顺手支持，但不值得投入。
6. **不要做图形化模块库（Enhancv 式图表/进度条/头像徽章块）。** Enhancv 以此为主要差异（[feature 页可见"可移动的模块"与用户评价](https://enhancv.com/features/humanize-your-ai-resume/)），但这类元素**正是 ATS 解析的常见失败点**（图标字体变空框、列/表格破坏阅读序——Reactive Resume 的检查器把这两类列为**具体问题**：[指南](https://docs.rxresu.me/guides/using-the-ats-checker.md)），且**与我们已有的可解析性评级 高/中/低 体系直接冲突**。**替代方案**：继续做"高可解析性"模板，把这个冲突当卖点讲清楚。
7. **不要做独立的 bullets / summary / objective 生成器。** 这些已是彻底的 table-stakes 且被商品化：Rezi 单列 [Bullet / Summary / Objective 生成器](https://www.rezi.ai/posts/what-is-rezi)，Enhancv 单列 [Bullet / Summary / Objective](https://enhancv.com/features/humanize-your-ai-resume/)，Huntr 单列 [Summary / Bullet / Skills 生成器](https://huntr.co/product/job-application-autofill)，国内超级简历也有[简历亮点生成 / 求职目标生成 / 个人简介生成](https://www.chaojijianli.com/blog-cv-content/)。我们已有 AI 诊断与提案式改写**覆盖了同一能力面**，再拆出独立入口只会碎片化，且滑向"产出 AI 味内容"——恰好是市场正在反感的方向（Enhancv 整页在讲这个）。
8. **不要把薪酬数据源当作近期依赖。** 我只找到非权威信源：一个第三方 [Levels.fyi API 封装](https://parse.bot/marketplace/543e5df9-c450-4ead-936b-8e2bb002be6f)、一份第三方简历工具的 offer 分析文档（[ResumeGuru](https://www.resumeguru.ai/docs/job-search/salary-and-offer-analysis)），以及一个开源 CLI 的**未实现 feature request**（[resume-cli issue #27](https://github.com/anchapin/resume-cli/issues/27)）。**没有找到任何主流简历产品公开的、可信的薪酬数据合作。** 因此 #11 应实现为"用户自填市场区间 + 逐项标注 unknown"，**不要**把外部薪酬 API 写进架构。
9. **已由上一轮覆盖、本轮不重复的项**（列出以免误算为新增）：中英双语翻译与合并导出（对照：Enhancv 的[翻译与本地化](https://enhancv.com/features/translate-resume/)提供 30 语种 + **按国家适配照片/篇幅/日期格式/个人信息**——其中"**按目标国家而非语言做本地化**"是我们可以低成本补强的一个细节，归入优化项而非新功能）；ATS 自检报告 + 解析器视角预览；版本历史 + 乐观锁；分享链接保护 + 过期；DOCX 导出；简历复制 + 按岗位变体；JSON Resume 双向适配；MCP server；pg_trgm 搜索；模板画廊按用途分面。
10. **不要用"要素组合式简历"作为新模板方向。** 我找到的 keyword-combination resume 相关结果是学术论文（[QR Resume: Interactive Resumes with Video and Certificate Integration, IEEE](https://ieeexplore.ieee.org/document/11005003)）与一个区块链 hackathon 项目（[W3rk, ETHGlobal](https://ethglobal.com/showcase/w3rk-i6d6e)），**没有任何主流产品把它做成功能**。作为类别不成立；其中的"证书/视频凭证"想法与第 5 节的"可验证凭证"一并搁置，**触发条件**：国内出现可对接的官方学历/证书核验接口时再评估。

### 4b. 陷阱：看起来诱人，但只有达到它们的规模才成立

这一节的判据是**规模而非技术**。以下都确实是竞品在做的事，且我们能做出来——**不该做的原因是我们没有它们的用户量**。这类判断比"技术上做不到"更容易被忽略，因此在排期前值得单独看一遍。

- **自动填充浏览器扩展**（已列第 3 条）。Resume.io、Huntr、Rezi、Teal 都在做。它的经济性是**每个用户每月多次投递、每次投递省几分钟**，靠"投递次数 × 用户数"摊薄那份**永不停止的 ATS DOM 适配**成本。我们的目标用户是"按 JD 精投少量岗位"——**投递频次低意味着同样的维护成本摊到更少的使用次数上**，单位经济性直接为负。而且扩展的失败模式很糟：ATS 改版后静默填错字段，用户可能投出一份错误申请，这是**信任级事故**，不是 bug。
- **Auto Apply / 代投递 / 简历分发**（已列第 4 条）。Resume.io 的 Resume Distribution 定价形态（试用期 50 位、月付 200 位招聘经理）说明它卖的是**投递量**。这要求两样我们没有的东西：**招聘经理侧的收件人网络**，以及**海量用户简历池**。没有网络，分发就是空转；没有池，网络对我们没有价值。而且它把产品从"帮你想清楚"变成"替你发出去"，**主动放弃了我们唯一的差异化（准）**。
- **万级模板与范文库**。职徒自称 1 万+ 模板、1 万+ 行业案例（App Store 自述，低置信）。这个策略的前提是**SEO 长尾流量规模**：一万个页面每个每月带几十次访问，合起来才有意义。我们以"用途分面 + 可解析性评级"取胜，做的是**少而可靠**；把模板数从 2 堆到 1000 会同时稀释质量、增加维护面，并且**在没有对应 SEO 体量的情况下不产生回报**。真正的杠杆是优化项 #3（无损试穿）与 #2（预览=下载）。
- **简历修改/导师辅导市场**（超级简历有导师辅导、职徒称有上百位导师在线改简历）。这是**双边市场**：需要供给侧（合格导师）与需求侧同时到量，还要处理结算、质量仲裁与退款。**在用户量到数千活跃之前不要碰**——早期做它只会得到"有订单无导师"或"有导师无订单"。**替代**：优化项 #11（章节级评论）让用户**自带**导师（学长、朋友、付费顾问），我们不承担供给侧责任，却能收获协作数据。
- **面向高校/机构的 B2B 就业管理系统**（职徒覆盖"高校就业分析管理系统"，[App Store](https://apps.apple.com/cn/app/id1524420173)）。这是完全不同的销售动作：招投标、私有化部署、数据合规审计、按年结算。**它会改变公司的形态**，不是加功能。若未来要走这条线，应当作为一个独立决策立项，而不是从简历编辑器里"顺手长出来"。
- **薪酬数据平台**（已列第 8 条）。可信薪酬数据是**数据生意**：需要持续的原始数据来源（招聘方、用户共享、政府/行业披露）与统计清洗管线。Resume.io 这类量级的产品都尚未公开做出可信的薪酬数据合作，说明**要么成本极高、要么没有可行路径**。我们的第 11 项应严格限定为"用户自填 + 逐项标 unknown"。

### 4c. 另外三条明确不做（本轮新增判断）

- **不做 AI 使用额度的"无限畅聊"式定价**。我们的 AI 已有配额与计费表，这是对的。竞品里已有无付费墙/BYOK 的路线（Reactive Resume 明确无付费档、BYOK），但我们是商业产品，**降价到无限会直接摧毁唯一稳定的收入结构**，而 AI 成本随使用线性上升。**结论：保持配额制**，把"便宜"做成"确定性解析不花 AI 配额"（第 1 节 #15），而不是"AI 随便用"。
- **不把"给简历打分"复用到产品内的其它场景**。ADR-0005 的精神是**只给可溯源的事实**。一旦我们为了转化率在公开页引入了数字分数（第 8 项），就必须抵抗"顺手也放进产品内"的诱惑——那会让 ADR 形同虚设。**规则**：分数若存在，只存在于**免登录的公开工具**，且带可抽取性免责声明；**登录后的产品内一律不给分**。这条应当写进 ADR 的补充说明，而不是靠记性。
- **不做"简历里有几处 AI 生成内容"的标注或水印**。理由同第 2 条（无法核实），但多一层风险：**一旦标注，它就成了我们对自己用户的指控**，而我们无法保证判定正确。若目标是"证明这份简历是用户本人的"，正确做法是第 2 项事实治理层的**来源与更正历史**——它记录"这条断言来自用户自己",而不是猜测"这句话像 AI 写的"。

---

## 5. 数据可信度说明

**A0. 双人独立核实（委派方与我各自独立读取同一来源并核对文本细节）— 置信度最高，可直接排期**
- **WebMCP**：状态 "**Draft Community Group Report, 13 October 2026**"，且明确 "**not a W3C Standard nor is it on the W3C Standards Track**"——**请勿在任何对外材料里称其为 W3C 标准**。契约面：`document.modelContext`、`ModelContextTool` 字典、`ToolActivatedEvent` / `ToolCancelEvent`、permissions-policy 集成。**关键**：其 §6.3 威胁模型**自己**就点名通过工具元数据的提示注入（"**Tool Poisoning**"）、输出注入与意图误表。**所以第 4 项的"工具安全标注"不是 Reactive Resume 的发明，而是规范安全章节要求出来的形状。**（https://webmachinelearning.github.io/webmcp/）
- **公开 ATS 检查器**：全部细节核实（纯浏览器内、不上传、免账户、≤25 MB、仅前 30 页；0–100 由五类合成、**阻塞项封顶**；阈值 ≥80 / 50–79 / <50）。**两处豁免亦已核实并写进第 1 节 #8 的冲突框**：写作建议 "**never affect the score**"，以及 "**The score reflects how reliably text comes out of the file, not your chances of getting the job.**"（https://docs.rxresu.me/guides/using-the-ats-checker.md）
- **排程发现**：服务端在浏览器关闭时运行、每天/3 天/每周、逐条校验是"单个**在招**职位"并跳过已确认关闭项、未跟踪职位一周后复查、"Salary not listed"/"Office days not stated" 被定位为**待解决的问题而非已满足的偏好**、Track in Applications / Not for me 带 Undo、暂停会取消进行中的工作——全部核实。**并额外确认那条易漏的约束**：发现需要**与 AI 文本辅导分开配置的"网页搜索连接"**，且 "**is not required just to schedule a discovery search**"——即**不配 AI 也能排程发现**。（https://docs.rxresu.me/guides/finding-roles-automatically.md）
- **无 AI 的 PDF 导入**："**PDF imports read the text layer without AI.**" 原文核实（https://docs.rxresu.me/api-reference/resumes/import-a-pdf-resume-json-or-linkedin-archive.md）。

**A0b. 本项目代码实证（由委派方对照本仓库核实）— 本轮最强的一类证据：不是"竞品有"，而是"我们确实没有"**
- `internal/data/resumevault/model.go` **没有** `deleted_at`、`archived`、`locked` 列；`internal/data/resumevault/resume.go:435` 的 `Delete` 是**硬删除**。
- 结论：第 12 项（锁定）与第 13 项（回收站/软删除）**是真实缺口，不是"锦上添花"**。
- **但成本必须诚实重估**：加 `deleted_at` 意味着**每一个列表查询与查找过滤都要改**，外加持保留期清理作业——在已有版本化 migrator 与多处 list 查询的代码库里**这不是小改动**。本报告已将第 12 项上调为**中**、第 13 项上调为**中—大**，并把第 13 项拆成"先做软跳转（小）/ 回收站单独排期（中—大）"两步。

**A. 已核实（一手来源，我直接读到页面正文）**
- Reactive Resume 的全部功能细节：v5.2.1 / v5.2.2 / v6.0.0 的 release notes（[v5.2.1](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v5.2.1)、[v5.2.2](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v5.2.2)、[v6.0.0](https://newreleases.io/project/github/reactive-resume/reactive-resume/release/v6.0.0)）以及**官方文档正文**：[职业知识](https://docs.rxresu.me/guides/building-career-knowledge.md)、[WebMCP](https://docs.rxresu.me/guides/using-webmcp.md)、[agent skills](https://docs.rxresu.me/guides/using-agent-skills.md)、[公开 ATS 检查器](https://docs.rxresu.me/guides/using-the-ats-checker.md)、[排程发现](https://docs.rxresu.me/guides/finding-roles-automatically.md)、[面试准备/复盘](https://docs.rxresu.me/guides/preparing-for-interview-day.md)、[私有备注](https://docs.rxresu.me/guides/using-private-notes.md)、[公开分享](https://docs.rxresu.me/guides/sharing-your-resume-publicly.md)、[完整文档索引 llms.txt](https://docs.rxresu.me/llms.txt)（含 API 参考的逐条描述）。技术手法：Mintlify 文档在页面 URL 后加 `.md` 可取得纯 Markdown 正文。
- Resume.io 更新日志原文（Auto Apply 与 Resume Distribution 全球上线、免费 AI ATS Checker、上传旧简历入口、一键按 JD 定制、推荐面板重构）：[updates.resume.io](https://updates.resume.io/)
- Huntr 功能面（AI Achievement Writer / Resume Tailor / Review、Kanban 求职跟踪、Job Clipper 扩展、Metrics & Contact Tracking）：[官方帮助中心](https://help.huntr.co/en/articles/10477521-what-is-huntr)；产品导航确认 [Job Application Autofill](https://huntr.co/product/job-application-autofill) 与 Chrome 扩展存在。
- Rezi 功能面（AI Resume Agent、Job Search、AI Interview、Chrome Extension、Resume MCP、模板只有 4 个 Simple/Modern/Compact/Creative、定价 Free / $29 月 / $149 买断）：[官方博客](https://www.rezi.ai/posts/what-is-rezi)、[MCP 页面](https://www.rezi.ai/resume-mcp)、[扩展页面](https://www.rezi.ai/rezi-chrome-extension)。**定价与模板数来自 Rezi 自己的营销页面**（企业自述，但属一手来源）。
- Enhancv 功能面（19 项 ATS 检查、翻译与**按国家**本地化、Chrome 求职跟踪扩展、AI Job Board、Interview Help、share-for-comments、多人协作与用户评价）：[humanize 页](https://enhancv.com/features/humanize-your-ai-resume/)、[扩展页](https://enhancv.com/features/ai-job-application-tracker-chrome-extension/)、[翻译页](https://enhancv.com/features/translate-resume/)
- 职徒简历 52cv：**中英双语 AI 模拟面试 + 实时互动 + 综合面试报告 + AI 面试押题 + 1000+ 面试题 + 一键排版/倒叙/全局行距页边距颜色切换 + 中英一键翻译合并导出**：[App Store 官方描述](https://apps.apple.com/cn/app/id1524420173)
- 超级简历 WonderCV：产品结构（简历模板/范文/导师辅导/校招/面试题库/AI 求职动态）与工具入口（个人简介生成、简历亮点生成、求职目标生成、job-description-keyword-finder）：[官方站点](https://www.chaojijianli.com/blog-cv-content/)
- 五百丁：编辑器实际字段与能力（**简历访问权限三档：所有人/密码/仅自己**、二维码模块、作品展示、自定义模块、字体字号页边距控制、简体/繁体、投递记录 `求职管理` 与工单/订单/优惠券）：[编辑器页面](https://www.500d.me/cvresume/edit/)
- WebMCP 规范状态（W3C Web Machine Learning CG Draft Community Group Report，13 October 2026；`read-only` / `untrusted content` / `consequential` 标注；安全与隐私章节含提示注入、意图误表、过度参数化隐私泄漏）：[规范正文](https://webmachinelearning.github.io/webmcp/)
- Careerflow.ai 的章节级评论功能（含"标记已解决"、评论不出现在导出中、仅协作者可见）：[官方帮助中心](https://help.careerflow.ai/en/articles/11827111-using-the-resume-commenting-feature)

**B. 第三方 / 营销来源（已标注，中低置信）**
- **模板数量与"1 万+"类数字**：职徒简历"模板总数超过 1 万个、1 万+ 行业案例、200+ 简历易错因子"来自其 **App Store 自述**，未经独立验证 → **低置信**。
- **Rezi 的"3+ million users / Forbes #1 / 首个 AI agent"**：来自 Rezi 自有营销页 → **低置信**。
- **Enhancv 的"30 languages / 25% longer in German / 5,357 reviews / 4.5 分"**：来自其自有页面 → **低置信**（方向可信，具体数字未经独立核验）。
- **国内与招聘侧趋势**：LinkedIn 招聘助手应对 AI 简历（[digit.in](https://www.digit.in/features/general/ai-resumes-are-the-new-headache-linkedins-hiring-assistant-is-trying-to-solve-for.html)）、"招聘人员 20 秒识别 AI 简历"（[vietnam.vn 中文转载](https://www.vietnam.vn/zh-cn/nha-tuyen-dung-chi-can-20-giay-de-nhan-ra-cv-do-ai-viet)）、"AI 简历验证危机"（[Cadient，供应商自述](https://cadient.ai/article/issuewire-ai-resume-verification-crisis)）、海投反噬（[ClavePrep](https://claveprep.com/blog/ai-job-application-agents-2026-mass-apply-guide)）、2026 招聘预测（[TechRound](https://techround.co.uk/news/expert-predictions-recruitment-2026/)）→ **低置信，仅作方向参考，不建议据此排期**。
- **Teal 的 autofill 能力**：`tealhq.com` 全站被 Cloudflare 403 拦截，我**只**从搜索结果标题与链接推断存在 [Autofill Job Applications](https://www.tealhq.com/tools/autofill-job-applications) 与 Job Matcher "Actions"（[帮助中心条目](https://help.tealhq.com/en/articles/12601338-new-job-matcher-actions-oct-25)，同样 403）。**未读到任何正文 → 低置信**。第三方评测如 [Wobo 的 Teal Review 2026](https://www.wobo.ai/blog/teal-review/)、[Hirecarta 的 Teal Review 2026](https://hirecarta.com/blog/teal-review) 未逐条核验。
- **Zety / Novoresume / VisualCV / FlowCV / Kickresume / Canva / Standard Resume 的本轮新增功能**：检索到的主要是第三方对比站与评测（如 [VisualCV 替代品盘点](https://dupple.com/learn/visualcv-alternatives)、[Kickresume 对比](https://four-leaf.ai/compare/four-leaf-vs-kickresume)），**未能取得一手 changelog → 本轮对这些产品的新增功能不作具体断言**。Kickresume 的"AI 面试工具"仅见其自有新闻稿（[student-career-toolkit](https://www.kickresume.com/en/press/student-career-toolkit/)）→ **低置信**。
- **简历本 / 乔布简历 / 全民简历 / 100 分简历**：本轮搜索未能取得可读的一手功能页（多数结果为聚合站与百科转述），**故不列具体功能断言**。第一轮若已覆盖则不必回溯。
- **薪酬数据**：仅有第三方 API 封装、第三方工具文档与一个未实现的 issue（见第 4 节 #8）→ **无可信一手来源**。

**C. 明确未能核实（不以推测填补）**
- **Reactive Resume v6 的 LinkedIn 导入实现方式与覆盖率**：文档索引只有一行描述，正文为客户端渲染，`.md` 变体对该页未返回正文；v1 文档页同样只返回导航框架。**结论：只确认"支持 LinkedIn 导出包导入且不使用 AI"，不确认其解析质量。**
- **Reactive Resume 的模板确数**：我读到的正文里有 **12**（v5.0.0 release notes）与 **17**（v6 文档：`Choosing a template`、`free-resume-builder` 用例页）两个数字。**这是两个不同版本的数字，不是矛盾**，但我**未逐一核对当前模板列表**。
- **Teal 的实际功能细节**（含 Job Matcher Actions 具体做什么）：站点全面 403，**无法核实**。
- **各家定价的当前准确性**：仅 Rezi 定价来自其自有页面；**Resume.io、Teal、Enhancv、Huntr、Zety 等的实时价格本轮未逐一核实**，报告中除 Rezi 外**未给出任何价格数字**。
- **"2026 table stakes"的判断依据**：本报告中标注为 table-stakes 的条目，依据是**至少两家独立产品已提供**（已在条目内点名）。这属于**推论**，不是任何机构发布的行业标准。**没有找到**权威的"2026 简历产品必备功能"清单。
- **Auto Apply / Resume Distribution 的实际效果与投诉率**：Resume.io 只陈述功能存在（[更新日志](https://updates.resume.io/)），**未提供任何效果数据**；我未找到独立的第三方效果评估 → **功能存在已核实，效果未核实**。
