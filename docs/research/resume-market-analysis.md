# 在线简历产品市场调研 & ResumeVault 功能差距分析

> 调研对象：国际/国内知名在线简历制作网站 + 主流开源简历项目
> 分析对象：本项目 ResumeVault（Next.js 16 + React 19 + Tailwind v4 + Go/Kratos 后端）

---

## 0. 结论速览（TL;DR）

当前项目在**内容模型（Markdown + YAML frontmatter）**和 **AI 对话式编辑**上已经具备差异化的底子，但在**"简历"这个产品的核心事**上都还有硬缺口：

| # | 硬缺口 | 严重度 | 一句话说明 |
|---|--------|--------|-----------|
| 1 | **PDF 是整页位图，没有文字层** | 🔴 致命 | `html2canvas` + `jsPDF` 把 A4 页面截成 PNG 再塞进 PDF。**ATS/招聘系统 100% 解析不了**（比"双栏矢量 PDF"严格更差），且单页体积可达数 MB、分页在任意像素处硬切把一条工作经历劈成两页。 |
| 2 | **"模板"只是内容种子，不是视觉模板** | 🔴 高 | 12 个"模板"共享同一套渲染（`ResumeDisplay` + `ResumePrintView` 各只有一种设计）。用户选"UX 设计师模板"只换了示例文字。行业标杆有 17 套（Reactive Resume）到 52 套（JSON Resume）。 |
| 3 | **没有"简历→岗位"的匹配/诊断能力** | 🔴 高 | 国内头部（超级简历）已把 `analyze_resume` / `match_resume_to_job` 做成核心 AI 技能。本项目 AI 只做"润色"。 |
| 4 | 简历只能单份存在，无法派生变体 | 🟠 中高 | 投不同岗位需要"复制 + 改"，目前无复制、无跨会话版本历史、无多语言版本。 |
| 5 | 没有打印样式、没有自动保存 | 🟠 中 | 全项目 0 处 `@media print` / `@page`；编辑器只能手动保存（自动保存是行业门槛功能）。 |
| 6 | 缺中文市场必备能力 | 🟠 中高 | 证件照、政治面貌/籍贯/期望薪资等字段、解析时区分「项目经历 vs 工作经历」、一页纸自动收缩、中英双语合并导出——**国内全线具备，本项目全无**。 |

**最能立刻拉开差距的四件事**（按投入产出比排序）：

1. **把 PDF 管线从"位图"换成"可选文本 + 页原生分页"** —— 这是产品的正确性问题，不是优化问题。**首选 Forme（`@formepdf/core`，Rust→WASM，跑在 Web Worker，零基础设施）**，理由与实证见 §3.2.1。
2. **给模板系统接上真正的视觉模板**（推荐 JSON Resume schema 适配层 + 多主题渲染）。
3. **加"ATS 体检 + 简历诊断 + JD 匹配"** —— 复用已有的多 provider AI 网关，成本极低，用户感知极强；且**"展示解析器实际读到了什么"在国内是无人占据的位置**。
4. **补齐中文市场的地基** —— 中文特有字段、证件照、一页纸自动收缩、项目/工作经历区分。

> ⚠️ **最关键的一条前置动作**：在写任何代码之前，先用现有 `usePdfExport` 导出一份中文简历，用 `pdfjs-dist` 抽取文字并统计字符数——**预期返回 0**。这一个测试就是整个 PDF 重构的商业理由（详见 §3.2.2）。

---

## 1. 当前项目能力盘点（代码事实）

### 1.1 已实现（做得好，是护城河的部分）

**内容模型**

- `src/lib/resume-parser.ts` — YAML frontmatter + Markdown 正文解析为 `ParsedResume`（frontmatter / sections / items 三层）
- `src/lib/resume-builder.ts` — 结构化数据 ↔ Markdown 双向转换（`parsedToEditable` / `editableToMarkdown`）
- frontmatter 字段：`name / title / email / phone / location / website / github / linkedin / avatar`

**AI 能力**（`src/components/AIUpload.tsx`, `src/components/AISectionChat.tsx`, `src/components/ResumeEditor.tsx`）

- 上传或粘贴 → `/api/ai/parse` 流式解析成结构化 Markdown
- 多轮对话改写，`contextKey` 按模块隔离对话历史
- 版本历史 + LCS 行级 diff 可视化 + 回退（`computeLineDiff`）
- 会话持久化到 `sessionStorage`（`rv-ai-session`），刷新不丢
- 分模块的预设提示词（`PRESET_PROMPTS`，如"用 STAR 法则优化每条工作描述"）
- 多 provider 网关：`openai-completions` / `openai-responses` / `anthropic-messages`，全局 Key（管理员）+ 个人 Key 双轨，含审批流

**编辑器**（`src/components/ResumeEditor.tsx`）

- 模块级拖拽排序（framer-motion `Reorder` + `dragControls`）
- 模块级新增/删除、条目级增删、描述条目增删
- 分栏编辑/预览切换（`ResumeSplitEditor`），移动端切换视图

**展示与分享**

- `src/app/resume/[slug]/page.tsx` — SSR 展示页 + `generateMetadata`（动态 title/description）
- 滚动关联动画、技能标签云、时间线布局

**平台能力**（这块明显强于多数开源项目）

- 用户体系、管理员后台、简历审核流（`draft/pending/approved/rejected`）
- 细粒度权限模型：`can_edit / can_delete / can_view_source / can_export_pdf / can_change_visibility` + 权限申请/审批（`grantPermission` / `revokePermission`）
- `next.config.ts` 里 CSP、安全响应头、`basePath` 子路径部署、API rewrite 代理——工程化程度不低

### 1.2 缺口与缺陷（按代码定位）

| 定位 | 问题 | 影响 |
|------|------|------|
| `src/hooks/usePdfExport.tsx:55-88` | `html2canvas` 截图 → `pdf.addImage(imgData...)`，**整幅长图在每一页重复 addImage**（同一份 imgData 反复嵌入） | ① PDF 无文字层，ATS/OCR 不可解析；② 体积膨胀（N 页 ≈ N 倍全页图）；③ 分页在任意像素处硬切，一条工作经历会被劈成两页且无表头续接 |
| `src/components/ResumePrintView.tsx:40-50` | `getSectionGradient()` 定义了 `indigo/purple/cyan/blue` 等冷色渐变（当前未被使用，是残留死代码） | 违反 `AGENTS.md` 明令禁止的冷色调；且说明该文件曾是另一套设计 |
| `src/components/ResumePrintView.tsx:101` | 打印视图字体栈是 `-apple-system ... “Noto Sans SC”`，与全站 `Noto Serif SC` 衬线标题不一致 | 屏幕预览与导出 PDF **观感不一致**，用户会觉得"导出后变了样" |
| `src/components/ResumeSourceView.tsx:37-51` | 语法高亮硬编码 `text-purple-400 / blue-400 / cyan-400 / green-400` | 直接违反设计规范（禁止冷色调） |
| `src/lib/resume-builder.ts:74-82` | frontmatter 值不加引号直接拼接 | 值里含 `:` 或 `#` 时产生**非法 YAML**，回读报错（如 `title: 前端: 专家`） |
| `src/lib/resume-parser.ts:142-149` | 非 ASCII slug 用**字符码求和**做 hash | 碰撞概率高（"张三"/"三张"同 hash），公开页 URL 可能互相覆盖 |
| `src/lib/resume-parser.ts:201` / `:181` | 技能识别靠 `title.includes('技能')`；技能拆分只按**半角逗号** `,` | 中文全角逗号 `，`、顿号 `、`、竖线 `|` 分隔的技能不会拆成标签；模块名叫"专业技能"勉强命中，"技术栈"才命中 |
| `src/lib/resume-parser.ts:103` | 日期行只匹配单行斜体 `*...*`，且仅当已有 item 时生效 | 日期写在 `###` 之前/之后位置不同就丢失 |
| `src/components/ResumeDisplay.tsx:214-218` | `section.content` 直接当纯文本渲染成 `<p>` | 段落里的 `**加粗**`、`[链接](url)`、`-` 列表**原样显示为符号**，Markdown 白写了 |
| `src/components/ResumeEditor.tsx:78-80` | `parsedToEditable(parsed)` 只在首次渲染调用一次；`useState` 初值捕获 | 父组件传入新 `parsed` 时编辑器**不刷新**（编辑保存后回到编辑态可能显示旧数据） |
| `src/app/resume/[slug]/page.tsx` 全局 | 无 `sitemap.ts` / `robots.ts` / `manifest`；公开页无 OG image、无 JSON-LD | 公开简历在搜索引擎/社交分享中几乎不可见——而"在线简历"的核心卖点就是被看到 |
| `src/components/ResumeEditor.tsx:407` | 头像只能填 URL；`next.config.ts:55-59` 的 `remotePatterns` 只白名单了 github/google/gravatar | 用户填任意图床 URL → PDF 导出时 `crossOrigin` 拉取失败 → 头像丢失；且**不能上传本地照片** |
| 全局 | 无 `@media print` / `@page`；无分页控制（`break-inside`） | Ctrl+P 不可控 |
| `src/app/my/page.tsx`、`DashboardClient` | 客户端 `filter` 过滤，接口无分页/排序/标签筛选 | 简历多了以后是性能与体验问题 |
| 全局 | 0 个测试文件；`AGENTS.md` 要求的 `npm run build` 之外无质量门禁 | 重构 PDF 管线这类高风险改动无安全网 |
| `src/app/globals.css:296-354` `.resume-content` | 一整套 `resume-content` 样式**无人使用**（死代码） | 说明曾有一个 markdown 渲染路径被删掉，现在缺一个正经的 Markdown 渲染器 |

---

## 2. 商业产品调研

### 2.1 国际主流产品

| 产品 | 编辑器形态 | 模板 | 差异化 AI | 导出 | 商业模式 |
|------|-----------|------|----------|------|---------|
| **Reactive Resume**（开源但可视为标杆） | 表单/分节构建器 | 多套视觉模板 + 自定义样式 | AI 润色、**AI Agent Workspace** | PDF / **DOCX** / Markdown / JSON + 打印 | 完全免费 |
| **FlowCV** ⭐ | 区块构建器 | ~30+，**免费全开放** | 拼写检查；Pro 有 AI + **求职 Tracker** | **免费无限次无水印 PDF** | 免费额度最慷慨：**全部模板 + 无限无水印 PDF + 1 封 Cover Letter**；Pro 仅 $5/月 |
| **Zety** | 分步向导 | 18+，可按 **1/2 栏筛选** | 简历检查（30+ 项问题）、JD 匹配 | 免费 **仅 TXT**；付费 PDF/Word/TXT | $1.95 试用 14 天 → **$25.95/4 周**（≈$337/年）；年付 $71.40 |
| **Resume.io** | 向导 + 实时预览 | 按 **ATS / Modern / Professional / Word** 分类 | AI 简历生成、**ATS Scorer**、500+ 行业范例 | 免费 **仅 TXT**；付费 PDF | $2.95/7 天 → $29.95/4 周；季付 $49.95 |
| **Novorésumé** | 区块构建器 | 16+（免费 8） | 内容建议 | **仅 PDF** | **"Pay once. No recurring billing."** 月 $21.99 / 季 $39.99 / 年 $149.99；免费限 1 页、3 字体、30 配色 |
| **Enhancv** | **WYSIWYG 画布 + 全拖拽** | "数百套"，+ 数十种 section | **ATS 13 项检查**、JD tailoring、**强制要求量化指标** | PDF | 免费 7 天（带品牌、**每条目上限 12**）；Pro 起 $16.50 |
| **Kickresume** | 区块 + AI 写作 | 免费 4 / 付费 40+ | AI Writer、**ATS Checker**、**Career Map**、**面试题生成**、AI 翻译 | PDF | 月 $24 / 季 $18/月 / 年 $8/月；**师生免费**；推荐券最高 $120 |
| **VisualCV** ⭐ | 区块构建器 | **仅 30+**（西方最少） | — | PDF + **个人网站** | Pro **$16/月按季付**：**访问统计（浏览/下载）**、可分享简历链接、ATS 模板、Cover Letter |
| **Teal** | 区块 + 求职工作台 | 免费 10 套（多为单栏） | **逐岗位关键词匹配**（免费给 Top-5） | PDF | **免费无限简历 + 无限求职追踪**；$29/30 天 · $79/90 天 · **$179/年** |
| **Rezi** ⭐⭐ | 区块构建器 | ~20 | **Rezi Score**、关键词扫描、**AI Resume Agent**、**AI 面试**、**Resume MCP** | PDF | 免费 1 份 + 3 次下载；Pro $29/月；**终身 $149**；**企业版 $99/月/200 人** |
| **Standard Resume** ⭐ | 极简区块 | 少 | AI 简历点评（Pro） | PDF + 在线页 | 免费含在线分享；Pro $19/月：**在线页浏览统计 + 自定义域名 + 禁止搜索引擎收录** |
| **Resume Worded** | **不是构建器**（上传诊断） | — | **0–100 分 + 30~40 项检查**、**AutoFix 一键修复 → 重新评分** | — | **$49/月**、季 $99、年 $229（站内有 75% 折扣倒计时） |
| **Huntr** | 求职工作台 | 免费 7 套 | **语义匹配（职责 + 资格，而非仅关键词）**、AI tailoring | **免费 PDF 导出** | 免费：无限基础简历 + 100 个求职追踪；Pro $40/月 · $90/季 · $160/半年 |
| **MyPerfectResume** | 引导式区块 | — | Smart Apply（分数免费、**建议付费**） | 免费 **仅 .txt** | $2.95/14 天 → **$23.95/4 周**；年 $95.40。**仪表盘 4 项游戏化清单，每项都是付费引导** |
| **Canva** | 自由画布 | 海量，且**最热门的恰是双栏 + 照片 + 图标**（ATS 最差） | — | PDF / JPG / PNG / SVG / MP4 / PPTX，**不支持 DOCX** | 做简历与下载**永久免费**；Pro €110/年（与简历无关） |
| **Google Docs** | 文档 + 模板库 | 有 | **零简历专项能力**（无评分/无匹配/无法校验解析） | 任意 | 免费 |

**从上述产品可提炼的公认真理：**

1. **"模板 + PDF 导出"已经不再是可收费的东西。** [FlowCV 免费层就给全部模板、无限次无水印 PDF、1 封 Cover Letter，且无需信用卡](https://flowcv.com/pricing)；Canva 做简历加下载永久免费；Kickresume 免费层也含无限下载。**不能把"导出 PDF"当作主要付费墙。**
2. **真正的付费面在 2025–2026 是：ATS/解析校验、JD 定向匹配、求职追踪、分享页统计、双语/Agent 工具。**
3. **"免费做、导出降级"仍是常见变现**，但**降级的方向出人意料**：[Resume.io 免费层只给 TXT](https://resume.io/pricing)（"Downloads only in TXT format"）、Zety 免费仅 TXT、MyPerfectResume 免费仅 `.txt`。**头部把"ATS 安全的格式"设为免费的那一档**——因为纯文本值不了钱，设计才值钱。这一点非常适合反向利用（见 §6 变现建议）。
4. **ATS 友好已被抬到营销头条**：OpenResume 把 "ATS friendly to top ATS platforms such as Greenhouse and Lever" 写进 README 第一条核心特性（[github.com/xitanggg/open-resume](https://github.com/xitanggg/open-resume)）；Novorésumé 打 "Rebuilt for ATS in 2026 and reviewed by 14 recruiters"（[模板页](https://novoresume.com/resume-templates)）；Resume.io 有独立的 `/resume-templates/ats` 分类页。
5. **报价模式正在反弹**：Novorésumé 整个定位就是 **"Pay once. No recurring billing."**；Rezi 提供 **终身 $149**；用户对 "试用 → 每 4 周自动续费" 的抱怨是该品类最大的负面情绪来源。**对自托管开源项目，"不做订阅"本身就是定位武器。**
6. **模板数量不是护城河**：VisualCV 只有 30+ 套却功能面最强；市场上从 4 套到 10,000 套都有。**别在数量上竞争，要在功能面上竞争。**
7. **AI 的演进路径是"润色 → 诊断 → 匹配 → 面试准备 → 职业路径"**。

#### 2.1.1 硬数据：ATS 解析到底会丢什么

一份覆盖 **3,313 份简历 PDF** 的 ATS 解析数据集给出了版式导致内容丢失的归因（[OwlApply 分析](https://owlapply.com/en/blog/canva-resume-builder-review)）：

| 丢失原因 | 占比 |
|---------|------|
| 双栏布局 | **17.2%** |
| 装饰性图标 | **10.6%** |
| 联系方式放在页眉带内 | 4.1% |
| 用表格做版式 | 0.7% |
| 未嵌入字体 | （被标记为风险项） |

另外，**把技能放在图片里的简历，评分低约 19 分**。

> 对本次决策的直接含义（两条都很硬）：
> 1. 位图 PDF **完全不存在文字层**，从构造上就 100% 解析失败——**比"双栏矢量 PDF"严格更差**。所以修 PDF 管线是**前置条件**，不是优化项。
> 2. 阶段二要做的第一套视觉模板应当是**单栏、无装饰图标、联系方式在正文区**的 "ATS 安全" 款；双栏/带图标的设计款可以后续提供，但必须让用户知情（在模板卡片上标注解析友好度）。
>
> ⚠️ 注意：OwlApply 是竞品分析方，其框架天然服务于自家"文件级 ATS 检查"产品。上述**统计类别**可用，但不要把它的营销结论当作中立事实。

#### 2.1.2 最值得偷的三个交互模式

1. **分数 → 一键 AutoFix → 重新评分（闭环）** —— Resume Worded 的 "AutoFix" 声称"几乎任何简历都能这样达到 90+"。这是该品类里**唯一能证明"改进确实发生了"的回路**。前提是评分必须可逐条解释。
   - ❌ **反面教材**：MyPerfectResume 把一个社交链接区块改名为 "Websites"，分数从 89 掉到 70 —— **无法解释的分数波动，本质是升级诱导**。不要发布一个你无法逐行辩护的分数。
2. **免费层"能测不能下"** —— Novorésumé 允许免费用户*测试*全部高级样式，只在**下载时**设墙。用户已经建好成品才碰到墙，转化率最高。
3. **游戏化清单驱动升级** —— MyPerfectResume 仪表盘 4 项清单（下载简历 / 查看分数 / 获取反馈 / 创建求职信），**每一项都是一次付费引导**，实现成本近乎为零。

### 2.2 国内主流产品

#### 2.2.1 国内市场的底层机制：在线简历 vs 附件简历

这是国内市场最核心、也最容易被移植海外产品思路的人忽略的机制（[智联职Q 讨论](https://zq.zhaopin.com/answer/14237213/)）：

| 产物 | 是什么 | 用途 |
|------|--------|------|
| **在线简历** | 平台内的结构化字段 | HR **首先看到**的；驱动搜索与匹配；**完整度直接影响曝光** |
| **附件简历** | 上传的 PDF/Word 文件 | **被打印、或被转发给用人部门负责人**决定是否面试 |

> 原文：「在线简历，一般是了解情况比较多。附件简历一般是打印或者发给领导看，是否需要叫来面试」

**用户长期困惑**（智联职Q 上大量重复提问）："HR 能看到附件简历吗？""发给面试官的是在线简历还是附件简历？"——**两个产物没有被可靠地一并呈现，用户不知道 HR 到底看的是哪一份。目前没人解决好这个困惑。**

**对 ResumeVault 的直接映射：**

- `resume/[slug]` 公开页 **就是** 在线简历
- PDF/DOCX 导出 **就是** 附件简历
- ➡️ 应增加一键 **「生成附件简历」**，并明确告知"HR 会看到哪一份"。**这是一个真实、成本极低、且无人解决的差异点。**

#### 2.2.2 主要玩家横评

| 产品 | 模板 | AI | 导入 | 导出 | 定价 | 关键启发 |
|------|------|----|------|------|------|---------|
| **超级简历 WonderCV** | 5,000+，按**求职阶段/赛道**分类（校招/社招/实习/留学/四大/保研/考研复试），可插入**学校 LOGO** | AI 生成、多维竞争力评分、**智能纠错 20 大常见问题**、**JD 解析匹配 5,000+ 表达模型**、**ATS 兼容性校准**、**岗位关键词密度检测** | PDF/Word/PNG/JPG/文本，**中文识别 92%**（复杂双栏 Word 仍不完美），**可视化字段映射**手动纠错 | PDF/PNG，**分享微信 / 发邮箱**；下载需会员；**中英切换会员限定** | **终身 ¥99.9 · 年 ¥79.9 · 月 ¥19.9** | 30,000,000+ 用户；**证件照制作是会员权益**；AI 生成的**批评点**是"太模板化，同岗位两人产出几乎一样" |
| **五百丁 500d.me** | **按 风格90 / 岗位2,599 / 用途165 / 语言80 / 院校668 分面** | **无 AI** | 会员限定（80% 还原度） | PDF + **Word** | 年 ¥29.9 · 超级 ¥66 · **终身 ¥180**（2022 年为 ¥39.9，涨了约 4.5 倍） | **分面导航是全市场最细致的**；**个性简历域名**；"求职行家"导师竞标市场 |
| **简历本** | 每套模板自带**范文**，显式展示使用人数 | — | — | PDF | 会员制 | **「转发简历到 HR 邮箱」**（填收发件人、主题、正文，可选是否附带 PDF）——**最接近 `resume/[slug]` 的国内形态**；**「自动缩成一页纸」**；有**撤销/操作历史，但保存退出后清空**（可超越的弱点）；**自定义字段** UI |
| **职徒简历 52cv.com** ⭐ | **10,000+ 套**，含 800+ 全球名校素材 | **一键智能优化**、**基于岗位关键词一键生成内容**、**200+ 易错因子扫描**、AI 面试押题、AI 模拟面试（中英双语 + 报告）、AI 职业规划、MBTI/霍兰德测评 | ✓ | **中英文一键翻译（10 秒 / 98% / 排版一致）+ 合并导出** | 月 ¥18 · 季 ¥38 · 年 ¥88 · **终身 ¥96** | 国内功能最完整的对手。**「一键自动页」「一键全部经历自动倒叙」「一键统一切换行距/页边距/颜色」「一键切换日期格式」**——这四个"一键"是纯排版工程，投入极低、体感极强 |
| **100分简历** | 60 通用 + 3,000+ 岗位（24 行业 / 300+ 细分） | 3 分钟生成；**AI 按岗位动态生成关键词，用户勾选后围绕关键词建简历**；发展连续性评估 + 行业赛道推荐 | **30+ 格式，上限 8M，20 秒，准确率 98%**；**解析时区分「项目经历」与「工作经历」并自动归类**；**同步智能校对** | **仅 PDF，不支持分享**（明显短板） | 3 天 ¥6 · 月 ¥12 · 季 ¥36 · 年 ¥79 | **解析时区分 项目经历 / 工作经历 是国内最值得抄的技术基准**（见下）；工作经历模块含 **下属人数 / 离职原因** |
| **乔布简历** | 行业 40+，风格黑白/彩色，模板上带**属性标签**（有技能证书）（有专业技能）（有荣誉奖励）（**双学位毕业生**） | 无 AI | — | **Word 版**按套购买 | **会员模板 ¥4.9/套**；¥69 套餐解锁全部 | **新用户自动送 3 天会员**（无需信用卡的限时试用）；**按套微交易 ¥4.9**——西方无一采用 |
| **全民简历** | 2,000+ 动态模板，50+ 行业；**12 种模块自由组合** | AI 生成、**STAR 法则改写**、关键词匹配、**调色盘千种颜色** | ✓ | ✓ | 免费增值 | **7 种语言**；**简历加密"零骚扰"**；自动排版 |
| **锤子简历** | 100+（自述 40+，数据冲突） | **完全对话式 AI 创建**，但*"底层专业提示词储备较少"*，效果强依赖用户提问水平 | — | PDF + Word；**分享与下载均需付费** | **月 ¥15.9 · 两年 ¥29.9 · 终身 ¥49.9** | 主攻金融/法律/制造业与 **35+ 中高层**；**¥29.9 买两年**——国内价格锚点极低 |
| **WPS 稻壳** | 海量 | — | — | — | **年卡 ¥87**，含模板/字体/图表/PPT美化/**简历**/PDF转换/OCR/去广告（50+ 特权） | ⚠️ **国内简历模板被打包进 ¥87/年的通用办公会员**——这给纯简历订阅设了硬性价格天花板，也解释了国内厂商为何偏爱终身制与人工服务 |
| **石墨文档** | 文档/表格模板 | 无 | — | — | — | 国内**纯文档**路线。证明中国用户**愿意把简历当文档编辑**，而不是填表单——这与本项目的 Markdown 路线天然契合 |

#### 2.2.3 超级简历的 AI 原子技能（可直接对标的功能清单）

超级简历把 AI 能力产品化成 **6 个原子技能**（[wondercv.com/clawcv/api-guide](https://www.wondercv.com/clawcv/api-guide)），并在主站明确宣传 **"ATS 系统兼容性校准"** 与 **"岗位关键词密度检测"**：

| 技能 | 能力 | 本项目现状 |
|------|------|-----------|
| `analyze_resume` | AI 打分 + 找问题 + 给建议 | ❌ 无 |
| `rewrite_resume_section` | 逐段改写，STAR 法则 | ✅ 已有（`AISectionChat` 预设提示词里就有 STAR） |
| `match_resume_to_job` | 简历 vs JD 对比，查缺补漏 | ❌ 无 |
| `generate_one_page_pdf` | 专业排版，一键导出 | ⚠️ 有导出但**无"一页"约束**，排版是位图 |
| `match_campus_recruits` | 校招职位推荐 | ❌ 无（超出本项目定位） |
| `get_ai_mentor_advice` | 面试准备 / 薪资谈判 / 职业规划 | ❌ 无 |

其免费额度设计也值得参考：普通用户 10 次 PDF / 20 次改写 / 20 次分析，会员 50 次，终身会员 100 次——**按 AI 动作配额**而非"功能开关"来卖。

同类产品 [五百丁](https://www.500d.me/) 的"100 分简历"对比中也强调"模板设计注重信息层级清晰，**便于招聘系统解析**"——说明国内市场的 ATS 叙事已经成型。

#### 2.2.4 国内特有字段与惯例（本项目目前全部缺失）

**字段层面**

| 字段 | 说明 |
|------|------|
| **证件照 / 一寸照** | **一级功能，不是附属**。简历本专门出证件照拍摄指南；超级简历把「证件照制作」作为会员权益；连 Canva/MPR 都提供照片/无照片筛选。规范：后置摄像头、**纯色背景、深色服装配白底最佳**、身体直立、距墙约 20cm |
| **政治面貌** | 中共党员 / 预备党员 / 共青团员 / 群众 / 民主党派。**国企与事业单位必备** |
| **籍贯** | 正式格式：省（自治区/直辖市）→ 市（盟）→ 旗县（市/区）（[清水河县政府通知](http://www.qingshuihe.gov.cn/yfxz/xbjggfwsxqd/zgh/202009/P020250314579470698868.pdf)） |
| **民族** | 出现在打印简历与体制内申请表上（[广西民族大学表样](https://msy.gxmzu.edu.cn/__local/A/C8/B5/977A50C3AC1E70A738D502F97C0_0514DDF6_89AE22.pdf)） |
| **出生年月 · 性别 · 婚姻状况 · 身高/体重** | 打印简历与体制内常见。**简历本做「自定义字段」正说明固定字段集永远不够——应提供"添加自定义字段"** |
| **期望薪资 / 期望城市 / 求职意向** | 标准头部字段。**西方简历惯例反而禁止写薪资期望**，所以移植西方模板会把这些字段丢掉 |
| **下属人数 / 离职原因** | 100分简历的工作经历模块字段 |

**结构层面**

| 惯例 | 说明 |
|------|------|
| **教育经历与 985/211/双一流** | 职徒卖 800+ 名校素材；五百丁按 **668 所院校**索引并提供"自定义"兜底，还允许上传**学校 LOGO**；超级简历也支持插入校徽。**对应届生而言，教育经历是首个模块** |
| **项目经历 vs 工作经历** | 100分简历在**解析时**区分二者并自动归类。对**没有全职经历的应届生**，项目就是简历的实质内容——**这是国内导入功能可用与不可用的分界线，本项目 AI 解析应实现** |
| **校园经历 / 社团经历 / 学生干部 / 荣誉奖项 / 自我评价 / GPA 与专业排名** | 100分简历的教育引导会提示"突出 GPA 3.72/4、专业前 10%"；乔布用（有荣誉奖励）（双学位毕业生）给模板打标签 |
| **一页纸执念** | 简历本有**「自动缩成一页纸」**；职徒有**「一键自动一页简历」**。西方只是限制页数，**"自动收缩引擎"才是国内特有** |
| **自动倒叙** | 职徒的一键归一化。中国用户常按任意顺序写经历，西方构建器直接假定倒叙 |
| **中英双语合并导出** | 职徒：**10 秒、98% 准确、中英排版高度一致、合并导出**；超级简历中英切换为会员功能。原因是**一次求职要同时投国企与外企**，西方无任何产品做这个 |

**交付与变现层面**

| 惯例 | 说明 |
|------|------|
| **附件简历邮件投递** | 简历本的**「转发简历到 HR 邮箱」**（收发件人、主题、正文，可选是否附 PDF；HR 点链接查看或看附件）是标准流程。**应移植到 `resume/[slug]`** |
| **在线投递次数限制** | 五百丁按会员档位限制在线投递次数。**西方从不限制投递次数** |
| **简历代投 + 企业 HR 直推** | 超级简历同时卖这两项；100分简历内嵌 **200+ 头部企业招聘入口**。西方无对应变现面 |
| **终身制是常态而非例外** | 超级简历 ¥99.9 · 职徒 ¥96 · 五百丁 ¥180 · 锤子 ¥49.9 · 知页 ¥30 · 乔布 ¥69 套餐。**中国用户期待一次性买断选项** |
| **极低价格锚点** | 职徒 **¥88/年**；100分简历 **¥12/月**；锤子 **¥29.9 两年**；WPS 稻壳 **¥87/年含整个办公套件** |
| **微交易** | 乔布 **¥4.9 一套模板**；简历点评 **¥9.9**。西方未采用 |
| **非求职用途** | 五百丁「用途」分面含 **考研复试 9 套 / 留学 10 套**；乔布索引「考研」；锤子卖 **小升初定制 ¥169**。**小升初是家长给孩子做升学申请，西方完全没有对应场景** |

> 价格提示：国内厂商定价页大多登录可见，上表多数来自 2022 年（牛客）与 2025-12（技术栈）第三方横评，**引用前应复核**。已发现的数据冲突：五百丁终身 ¥39.9（2022）→ ¥180（2025）；超级简历月 ¥19 → ¥19.9；职徒月 ¥15 → ¥18、终身 ¥93 → ¥96；锤子模板数"100+"（正文）vs"40+"（同文摘要）。

---

## 3. 开源项目调研

### 3.1 关键项目与可借鉴点

| 项目 | ★ / 最近推送 | 许可 | 内容模型 | 模板/主题模型 | PDF 管线 | 借鉴点 |
|------|------------|------|---------|-------------|---------|--------|
| **[reactive-resume](https://github.com/reactive-resume/reactive-resume)** v6 | **44,160** / 2026-10 | MIT | **Zod schema → JSON Schema**，TipTap 富文本，自定义 section，结构化日期，JSON-Patch diff | **17 套 React 组件模板**（`packages/pdf/src/templates/<name>/{NamePage.tsx,semantic.ts}`），每套自带 `semantic.ts` 描述 CSS 钩子，用户自定义 CSS 因此是**模板感知**的 | **Forme**（`@formepdf/core`，Rust→WASM）跑在 **Web Worker**；**同一引擎在服务端 Node 复用**。**不需要 headless 浏览器**。字体经 `harfbuzzjs` **按文档子集化** | ⭐ **最重要的参照物**：它曾经就是"服务端 browserless 打印"路线，v6 **主动废弃**了（README：*"No Browserless, Chromium, or external print service is needed. Legacy PRINTER_* / BROWSERLESS_* env vars can be removed."*）；**17 套真模板**；**ATS 检查器直接解析自己导出的 PDF**；AI 以**提案**形式呈现可逐条接受/拒绝；版本 + 200 步撤销；公开分享含密码与浏览统计；求职 Tracker；REST + **MCP server** |
| **[jsonresume.org](https://github.com/jsonresume/jsonresume.org)** | 326（mono）/ 2,388（已归档 schema） | MIT | **JSON Resume v1.0.0 JSON Schema**，`additionalProperties: true` | **52 套主题**（`jsonresume-theme-*` npm 包，各自是 React 组件），另有 `theme-kit`/`theme-config` | 主题 → HTML → **headless Chrome（Puppeteer）** | **注册表机制是模板生态的答案**：任何人发一个符合接口的 npm 包即可上架，52 套主题全靠社区。另有 `packages/ats-validator` |
| **[rendercv](https://github.com/rendercv/rendercv)** | **17,736** / 2026-05 | MIT | **YAML**（Pydantic 校验，生成 JSON Schema 供编辑器补全） | **主题是 YAML 设计覆盖层，不是代码**（ember/engineeringclassic/engineeringresumes/harvard/ink/moderncv/opal/sb2nov）；`rendercv create-theme` 可脚手架 | **YAML → Jinja2 → `.typ` → `typst` 二进制**；同时输出 MD/HTML/PNG | ① **排版质量天花板**；② **主题用 YAML 声明而非写代码**——大幅降低新增主题的成本；③ 严格校验 + 错误字典；④ 自动生成 AI agent skill |
| **[open-resume](https://github.com/xitanggg/open-resume)** | 8,924 / **2024-10（停滞约 2 年）** | **AGPL-3.0** ⚠️ | Redux store（表单形状，非文档树） | **只有一套**写死的 ATS 安全模板 | **`@react-pdf/renderer`**，客户端 → **矢量 PDF** | ① **简历解析器**（`pdfjs-dist` + 可读性算法）让用户自测 ATS；② 纯本地可离线；③ ⚠️ **AGPL 许可，抄代码要谨慎** |
| **[Resume-Matcher](https://github.com/srbhr/Resume-Matcher)** | **28,643** / 2026-10 | Apache-2.0 | 上传的 PDF/DOCX 主简历；AI 逐岗位裁剪 | 几种 PDF 模板 | PDF 导出 | **AI 裁剪主线**：主简历 + JD → 定制简历 + Cover Letter + **关键词缺口**；中文 README |
| **[木及简历 react-resume-site](https://github.com/hua1995116/react-resume-site)** | 2,311 / 2024-04 | GPL-3.0 | **Markdown**（markdown-it + 容器/div/emoji 插件） | **LESS/CSS 主题**经 gulp 编译为 `public/themes/*.css`，运行时热切换 | ⚠️ **把用户 HTML+主题发到硬编码的腾讯云 API 网关**，`SecretId`/`SecretKey` **明文提交在 `src/service/htmlToPdf.ts`** | ① **「智能一页」**——自动检测溢出并重排到一页（**与本项目最相关的国内参照**）；② 「内容-视图」双向定位；③ 可调证件照槽位；④ ⚠️ **反面教材：客户端硬编码云厂商密钥** |
| **[oh-my-cv](https://github.com/Renovamen/oh-my-cv)** | 1,096 / 2024-07 | GPL-3.0 | **Markdown**，local-first（IndexedDB） | 主题色/字体/行高/边距作为设置项，任意 Google Font | **浏览器原生导出**（建议 Chromium） | 本地优先、无账号；证明"Markdown + 浏览器原生打印"路线可行 |
| **[resumed](https://github.com/rbardini/resumed)** | 551 / 2026-09 | MIT | **JSON Resume** | 按名称消费 npm `jsonresume-theme-*` | **Puppeteer headless Chrome** | 现代版 `resume-cli` 替代品 |
| **LaTeX 模板族** | [Awesome-CV](https://github.com/posquit0/Awesome-CV) 28,693 · [sb2nov/resume](https://github.com/sb2nov/resume) 7,037 · [Deedy-Resume](https://github.com/deedy/Deedy-Resume) 5,066 · [moderncv](https://github.com/xdanaux/moderncv) 1,941 | 各异 | `.tex`（**是模板而非生成器**，需手改） | — | LaTeX/XeTeX | 学术/技术简历的排版金标准；字段与版式值得抄 |
| **Typst 系** | [brilliant-CV](https://github.com/yunanwg/brilliant-CV) 844 · [chicv](https://github.com/skyzh/chicv) 728 · [modern-cv](https://github.com/ptsouchlos/modern-cv) 630 · [imprecv](https://github.com/jskherman/imprecv) 514 | 多为 Apache-2.0/CC0 | YAML/TOML → Typst 包 | Typst 包参数 | Typst | 证明"数据 + Typst 包"模式可用且轻量 |
| **(已停滞但值得当功能清单看)** [HackMyResume](https://github.com/hacksalot/HackMyResume) | 9,330 / **2022-04 停更** | MIT | JSON Resume | 主题 | 多引擎 | **多格式输出的最佳功能清单**（HTML/MD/LaTeX/Word/PDF/TXT/JSON/XML/YAML）；也是维护者倦怠的警示 |

**⚠️ 仓库路径纠正**（调研中发现多处已迁移或不存在）：`AmruthPillai/Reactive-Resume` → **[reactive-resume/reactive-resume](https://github.com/reactive-resume/reactive-resume)**；`sinaatalay/rendercv` → **[rendercv/rendercv](https://github.com/rendercv/rendercv)**；`jsonresume/resume-schema` 与 `resume-cli` **已归档**，内容并入 **[jsonresume/jsonresume.org](https://github.com/jsonresume/jsonresume.org)**（npm 包名 `@jsonresume/schema`、`resume-cli` 不变）；`deedy5/Deedy-Resume` → `deedy/Deedy-Resume`。**未找到**：`Resume-Next`、`Gitzella/DevResume`、`resume-astro/resume-astro`、`mujicv/mujicv`。

### 3.1.1 ⭐ 深度剖析：Reactive Resume v6 的四个可移植机制

这是本项目最重要的参照物，值得单独展开。

**(1) `assertPdfText` —— 把"ATS 安全"从营销词变成断言**

`packages/pdf/src/forme/render.tsx` 在返回 blob 前，对每个导出入口都调用它：

```ts
export function assertPdfText({ missingFonts, warnings }) {
  if (missingFonts.length > 0)
    throw new Error(`Fonts could not be loaded: ${missingFonts.join(", ")}…`, { cause: "pdf-text-loss" });
  if (warnings.some(w => w.includes('was rendered as "?"') || w.includes("character(s) of source text did not render")))
    throw new Error("Some PDF text could not be rendered. Choose a font containing these characters…", { cause: "pdf-text-loss" });
}
```

> **这是全篇最容易移植、收益最高的一段代码。** 约 50 行：导出后立刻用 `pdfjs-dist` 抽出 PDF 文字，若为空或含替换字符（`�`/`?`）就**拒绝交付该文件**。它把"我们觉得 ATS 安全"变成一条**可执行的断言**。

**(2) CJK 字体按文档子集化 —— 中文场景的头号性能风险**

`packages/pdf/src/browser.tsx` 的注释原文：

> *"Fonts cut to each document's characters and encoded once: whole CJK faces, which Forme encodes byte by byte on every render, made each render of a CJK resume take **seconds** (#3593). If harfbuzz can't load, fonts go whole."*

并用 `cjk-regex` 的 `cjkLetters().toRegExp()` 探测文档是否含 CJK（`resumeContentContainsCJK` / `resumeContentScripts`）来决定加载哪些字体。

> ⚠️ **对一个中文优先的简历产品，这是本次调研中最重要的工程事实**：整字面 CJK 字体内联 = 每次导出**秒级耗时 + 数 MB 文件**。本项目选型时必须把"是否支持按文档子集化"当作硬指标。

**(3) ATS 检查器是"PDF 阅读器"，不是"linter"**

`packages/resume/src/ats-pdf/` 是一条完整的文本抽取 + 版式推理流水线：`extract.ts` 重建 span（含 PDF→左上角坐标翻转）→ 按 `LINE_TOLERANCE_RATIO = 0.35` 聚成行 → **用直方图检测分栏间隙**（`COLUMN_GAP_RATIO = 2.5`、`MIN_GUTTER_WIDTH_PT = 20`，且只在页宽 20%–80% 区间搜索，避免把右侧大留白误判为分栏）→ `rules/{layout,parseability,sections,contact,dates,content}.ts` 打分 → `jd/` 用 n-gram + 别名 + 停用词 + `wink-porter2-stemmer` 做 JD 关键词匹配。

> 比大多数产品里那个"ATS 模式"开关深得多，也正好对应 §2.1.1 那份数据中双栏 17.2% / 图标 10.6% 的归因。

**(4) AI 是"提案"，不是"覆写"**

编辑以 diff 形式展示**改了什么、为什么改**，可**逐条接受/拒绝**，对话按文档作用域隔离。对比本项目 `AISectionChat` 目前是 `onApplyContent` 整体替换——**升级为逐条 diff + 接受/拒绝是明显的体验提升，且本项目已有 `computeLineDiff` 可直接复用**。

### 3.2 PDF 管线的技术选型对比（本项目最关键的决策）

| 方案 | 可选文本 / ATS | 分页控制 | CJK 字体 | 体积 | 运行成本 | PDF/UA | 适合本项目？ |
|------|--------------|---------|---------|------|---------|--------|-------------|
| **现状：jsPDF + html2canvas（位图）** | ❌ **完全无文字层**，ATS 必然失败 | ❌ 按像素硬切，条目/标题被劈开 | ❌ 无法内嵌字体（就是图片） | 🔴 大（每页一张 2× PNG） | 🟢 零 | ❌ | **必须替换** |
| **⭐ Forme**（`@formepdf/core`，Rust→WASM，Web Worker） | ✅ 真矢量文本 | ✅ **页原生流式排版 + Knuth-Plass 断行 + 孤行/寡行控制 + 表格重复表头** | ✅ **`harfbuzzjs` 按文档子集化**（Reactive Resume 实证） | 🟢 小 | 🟢 **零基础设施**（~20MB WASM，首次导出才下载） | ✅ **PDF/UA-1 + PDF/A-2/3，veraPDF 9/9** | ✅ **首选** |
| **Typst**（`typst.ts` WASM 或二进制） | ✅ 真文本；0.14 修了"多字符映射同一字形"的抽取问题 | ✅ **最佳**（页原生，`breakable`/`sticky`，真孤寡行规则） | ✅ **最佳**（自带完整 CJK 字体、`cjk-latin-spacing`） | 🟢 **最小** | 🟠 需引入 `typst` 二进制或 WASM | ✅ **0.14 默认 tagged，可输出 PDF/UA-1**，支持 PDF/A-1b…4e | ✅ 长期理想（但要写第二套模板） |
| **`@react-pdf/renderer`**（OpenResume 方案） | ✅ 矢量 + 文字层 | ✅ 显式分页 | ⚠️ **CJK 断行/连字长期偏弱**，需自建字体子集化 | 🟢 小 | 🟢 零 | ❌ | ⚠️ 稳妥但 CJK 要额外投入 |
| **浏览器原生打印 + Paged.js** | ✅ 真文本 | ✅ `@page` + `break-inside`（Paged.js 更强） | ✅ 系统字体（但**无子集化**） | 🟢 小 | 🟢 零 | ❌ | ⚠️ 成本最低的**过渡方案**；Paged.js 本身不出 PDF，仍需浏览器 |
| **服务端 headless Chromium**（Puppeteer/Playwright） | ✅ | ✅ | ✅ | 🟢 小 | 🔴 容器 300MB–1GB、冷启动数秒、需队列与 SSRF 防护 | ❌ Chromium 无法产出 tagged/PDF-UA | 后期（若同时需要复杂 CSS 的像素保真） |
| **WeasyPrint**（Python，无浏览器） | ✅ | ✅ | ✅ | 🟢 小 | 🟠 Go 后端要挂 Python sidecar | ⚠️ | 备选 |

**关键证据**

- **位图 PDF 没有文字层**已被反复确认：见 [jsPDF 可选文本问题](https://stackoverflow.com/questions/77928881/selectable-pdf-creation-is-not-working-with-jspdf) 与中文说明[《为什么使用 html2canvas.js 导出的 PDF 无法选中文字》](http://imd.oa22.cn/bbs.asp?id=37471)；社区里有与本项目**完全同型**的失败报告：[psavidis/resume#38 "The PDF Resume cannot be read by Applicant Tracking Systems"](https://github.com/psavidis/resume/issues/38)。ATS 厂商自己的文档也把"解析失败"归因于不可读的 PDF 结构：[Recruiterflow](https://help.recruiterflow.com/en/articles/7996760-my-resumes-are-not-being-parsed)、[Recruit CRM](https://help.recruitcrm.io/articles/3639421-parsing-failed)。
- **Typst 0.14 的 PDF 导出被重写到 `krilla`**，changelog 原文：*"Typst now produces accessible PDFs out of the box… PDFs are now tagged by default… Typst can now emit documents conforming to the PDF/UA-1 standard."* 同时修了 *"Text extraction (i.e. copy paste) — now works correctly even when multiple different characters result in the same glyph"*、断行处空格保留、连字符 Unicode 映射（[changelog](https://typst.app/docs/changelog/0.14.0/)）。
- **Forme**（[formepdf/forme](https://github.com/formepdf/forme)，221★，MIT，2026-02 首发）是改变算式的那一块：Rust→WASM，已发布到 npm / crates.io / PyPI，带 React/Svelte/Vue 绑定、HTML+打印 CSS 入口（`@formepdf/html`）、`@formepdf/next` 适配器。其定位 *"Paginated PDFs in-process - no headless browser"* 正是本项目要的中间路径。**风险提示**：项目很年轻（2026-02 首发），其打印 CSS 支持"有文档但非 100%"，需对照 [docs.formepdf.com/html](https://docs.formepdf.com/html) 验证模板 CSS。
- **Paged.js**（1,529★，MIT）是另一个无浏览器选项，但**它本身不产出 PDF**（仍要经由浏览器打印），因此**不能消除 Chromium 依赖**；且 [XWIKI-20359 "Don't use Paged.js to layout the print pages unless really needed"](https://jira.xwiki.org/browse/XWIKI-20359) 是一份真实世界的性能警示。
- **DOCX 常常比 PDF 更 ATS 友好**，且是招聘方明确索要的格式。Reactive Resume 有完整的 `packages/docx`（`docx ^9` + 自研 `html-to-docx`）。

### 3.2.1 建议采用的路线

> **结论修订**：初版分析建议"浏览器原生打印 + Paged.js"。拿到 Reactive Resume v6 的实现后才看到更优的中间路径。修订后的排序：

1. **首选：把 jsPDF+html2canvas 换成 Forme（`@formepdf/core`）跑在 Web Worker 里。**
   - 迁移面最小：**保留"纯前端、零基础设施"的现有属性**，同时拿到矢量文字、真正的页原生分页、字体子集化、PDF/UA，且**服务端可复用同一引擎**（未来要从 Kratos 出权威 PDF 时不用重写）。
   - Reactive Resume 以 44k star 的体量在这条路上押注，并**彻底移除了 Browserless**。
   - 风险：项目年轻（2026-02 首发），打印 CSS 子集需验证。
2. **如果愿意维护第二套模板，用 Typst**（客户端 `typst.ts` WASM / 服务端 `typst` 二进制）。换来最好的排版、最好的 CJK 断行、默认 tagged PDF/UA 与 PDF/A。RenderCV 的影响力证明 YAML→Typst 模型成立。**对中文优先、对标点与断行有要求的场景，这可能值得。**
3. **`@react-pdf/renderer`** 是最保守的选择（OpenResume 用的），能出真矢量文本，但要为 CJK 断行额外投入，并会重新遭遇 Reactive Resume 已用 `harfbuzzjs` 解决过的字体子集化问题。
4. **服务端 headless Chromium**：只有在"仍需与复杂现有 CSS 保持像素级一致"且愿意承担容器成本时才选。它严格比 Forme 重，且拿不到 PDF/UA。
5. **保留位图导出，但只作为"视觉预览 / 图片分享"用途。永远不要把它当作投递给雇主的文件。**

**无论选哪条，都有一件不可省的事**：移植 `assertPdfText` 的思路——**导出后立刻抽取 PDF 文字并断言非空、无替换字符，否则拒绝交付**。本项目 React 生态里已有 `pdfjs-dist` 可用，约 50 行代码。

### 3.2.2 ⚠️ 必须先验证再动手：一个 5 分钟的判定实验

在投入任何重构之前，先用现有管线做这个实验（结论会决定后续所有工作）：

1. 用当前 `usePdfExport` 导出一份真实中文简历 PDF；
2. 用 `pdfjs-dist` 的 `getTextContent()` 抽取文字，**统计字符数**——预期返回 **0**；
3. 把这一步固化成常驻测试用例。

**这一个测试就是整个重构的商业理由，也是防止将来回归的安全网。**

### 3.2.3 已废弃的初版结论（保留备查）

> 初版分析在拿到 Reactive Resume v6 的实现之前，曾建议"先用浏览器原生打印 + Paged.js 作为最优先方案"。**该结论已被 §3.2.1 取代**：Paged.js 本身不产出 PDF，无法消除浏览器依赖，而 Forme 在同样"零基础设施"的成本下给出更好的结果。原对比表已并入 §3.2，此处只留判断变更记录。

---

## 4. 功能差距矩阵

图例：✅ 已有 · ⚠️ 部分/有缺陷 · ❌ 缺失
优先级：P0 = 不做就是产品缺陷 · P1 = 强竞争力 · P2 = 锦上添花

### 4.1 门槛功能（Table Stakes）—— 缺了就是"不能用"

| 功能 | 商业产品 | 开源标杆 | 本项目 | 优先级 |
|------|:-------:|:-------:|:-----:|:-----:|
| 结构化编辑器 | ✅ | ✅ | ✅ | — |
| 实时预览 | ✅ | ✅ | ✅ | — |
| AI 逐段改写 | ✅ | ✅ | ✅ | — |
| 自动保存 + 云端同步 | ✅ | ✅ | ⚠️ 仅手动保存 | **P0** |
| 多套**视觉**模板 | ✅ | ✅ | ❌ | **P0** |
| **带文字层的 PDF** | ✅ | ✅ | ❌ | **P0** |
| 分页/分页符控制 | ✅ | ✅ | ❌ | **P0** |
| 浏览器打印样式 | ✅ | ✅ | ❌ | **P0** |
| 多份简历管理 | ✅ | ✅ | ✅ | — |
| 导入既有简历 | ✅ | ✅ | ✅（AI 解析） | — |
| 完整的评分/完整度提示 | ✅ | ⚠️ | ❌ | P1 |
| 章节库（证书/奖项/语言/发表/志愿/校园经历） | ✅ | ✅ | ⚠️ 仅 5 个预设 | P1 |
| 简历复制/派生变体（逐岗位定制） | ✅ | ✅ | ❌ | P1 |
| 富文本/Markdown 正确渲染 | ✅ | ✅ | ❌ 纯文本 | P1 |
| 证件照/无照片切换 | ✅ | ⚠️ | ❌ | **P1（国内）** |
| 导出 DOCX | ✅（Canva ❌） | ✅ | ❌ | P1 |
| Undo / Redo | ✅ | ✅ | ❌ | P1 |
| 版本历史（跨会话，非仅 AI 会话内） | ✅ | ✅ | ⚠️ 仅 AI 会话内 | P1 |
| 邮件/社交分享简历 | ✅ | ✅ | ⚠️ 有链接，无邮件投递 | P1 |

### 4.2 差异化功能（Differentiators）—— 按"效果 × 本项目可行性"排序

| # | 功能 | 代表产品 | 本项目 | 优先级 |
|---|------|---------|:-----:|:-----:|
| 1 | **解析层 ATS 校验**（展示**提取出的文本** + 文件级风险） | Resume Worded 只做内容评分（且被批评）；**国内无人做** | ❌ | **P1（本项目已有解析链路，近乎免费）** |
| 2 | **JD 定向匹配**（粘贴 JD → 关键词/语义缺口） | Huntr（关键词 + 职责 + 资格）、Teal（免费给 Top-5）、超级简历、100分简历 | ❌ | **P1（高性价比）** |
| 3 | **"分数 → 一键修复 → 重新评分"闭环** | Resume Worded AutoFix | ❌ | P1（需先有 #1 才诚实） |
| 4 | **纯文本 (.txt) 导出** | Resume.io / Zety / MPR 的免费层**唯一**格式 | ❌ | **P1（成本极低）** |
| 5 | **"招聘系统读到什么"提取预览** | **国内无人做成一级 UI** | ❌ | **P1（成本极低）** |
| 6 | **公开页访问统计（浏览 + 下载）** | VisualCV、Standard Resume、Resume.io（免费层也限制它） | ❌ | **P1（成本极低）** |
| 7 | **自定义分享 URL + 禁止收录 + 密码保护** | Standard Resume（自定义 URL + 隐藏于搜索引擎）、五百丁（个性简历域名） | ❌ | P1 |
| 8 | **中文特有字段 + 任意自定义字段** | 简历本（自定义字段 UI）、国内全线 | ❌ | **P1（国内必需）** |
| 9 | **证件照工具（裁剪/底色/尺寸 + 拍摄引导）** | 简历本、超级简历（会员权益） | ❌ | **P1（国内必需）** |
| 10 | **一页纸自动收缩 + 自动倒叙 + 日期格式/行距/边距一键统一** | 职徒、简历本 | ❌ | **P1（纯排版工程，投入低体感强）** |
| 11 | **解析时区分「项目经历」与「工作经历」** | 100分简历（98%/20 秒基准） | ❌ | **P1（对应届生是分界线）** |
| 12 | **中英双语 + 合并导出** | 职徒（10 秒/98%/排版一致） | ❌ | P2（西方零竞争） |
| 13 | **模板库按「求职阶段/用途」分面**（校招/社招/实习/留学/考研复试/内推），而非按视觉风格 | 五百丁（用途 165 / 院校 668）、超级简历 | ❌ | P2 |
| 14 | **附件简历邮件投递**（发 HR 邮箱，链接 + 可选 PDF 附件） | 简历本 | ❌ | P2（+ 明确"HR 看哪一份"） |
| 15 | **模板解析友好度标注**（高/中/低） | 无人明确做 | ❌ | **P2（零成本信任设计）** |
| 16 | **真正的版本历史**（跨保存存活） | 简历本有撤销但**保存退出即清空**；无人做好 | ❌ | P2（Markdown 存储让它近乎免费） |
| 17 | Cover Letter / 求职信 | Reactive Resume、Kickresume、Teal | ❌ | P2 |
| 18 | 自定义样式（主色/字体/行距/边距） | Reactive Resume Custom Styles、全民简历千色盘 | ❌ | P2 |
| 19 | **MCP / 开放 API**（让 LLM 操作简历） | Rezi Resume MCP、Reactive Resume MCP | ❌ | P2（**开源项目的天然噱头**） |
| 20 | 面试准备 / 题库 / 薪资谈判 | 职徒（中英双语模拟面试 + 报告）、Rezi、超级简历、Kickresume | ❌ | P2（**在国内属门槛级**） |
| 21 | 求职进度 Tracker | Teal（免费无限）、Huntr、Reactive Resume | ❌ | P3 |
| 22 | 游戏化引导清单 | MyPerfectResume 4 项清单 | ❌ | P3（实现成本近乎为零） |
| 23 | 人工专家服务撮合（导师竞标） | 五百丁「求职行家」、职徒 ¥150–500、简历本 | ❌ | P3（零工程风险的收入线） |

### 4.3 新兴趋势（2025–2026）

1. **AI 从"助手"变"Agent"**：Rezi 的 **AI Resume Agent**（"与 AI Resume Agent 对话以提升 Rezi Score、定向岗位"）是*有状态、拥有整份文档*的 agent，而非逐字段的 AI 按钮；锤子已完全对话式创建；100分简历支持模块级对话生成。Reactive Resume 有 *AI Agent Workspace*。
2. **⭐ MCP / LLM 原生接口**：Rezi 已上线 **Resume MCP**（"Manage resumes in LLMs"）；超级简历把能力封装成 MCP **Skill** 供 OpenClaw/Claude 调用（`npx clawcv`）。**本项目已有完整多 provider 网关 + 多轮对话基建 + Markdown/YAML 存储，接 MCP 的成本远低于任何从零做的团队，且对开源项目是天然的话题点。**
3. **"文件级解析校验"成为一个独立产品面**：Resume Worded 被明确批评"只评分内容、不开导出文件"，而 OwlApply 一类工具主打"提取文本 + 17 项文件级发现"。**这是本项目的楔子。**
4. **语义匹配（而非关键词匹配）**：Huntr 宣称"不仅匹配关键词，还匹配**职责与资格**"。
5. **反订阅情绪**：Novorésumé 整个品牌建立在 "Pay once. No recurring billing." 之上；Rezi 提供终身 $149。**自托管开源项目"不订阅"本身就是定位武器。**
6. **ATS 优化前置化**：从"投递后被发现"变成"写的时候就保证可解析"。
7. **隐私优先**：OpenResume 主打"数据不出浏览器"；全民简历主打"简历加密零骚扰"。与本项目"自托管 + 细粒度权限 + 审核流"天然契合，是可讲的品牌故事。
8. **简历从文档变成多产物捆绑**：Kickresume 网站构建器、VisualCV 个人网站、Canva 组合页/PPTX。建议先做 `resume/[slug]` 的"个人网站化"。
9. **JSON Resume schema 作为互操作层**：让内容模型标准化，模板/主题/工具变成可插拔生态。本项目已有 `ParsedResume` 结构，**加一个 JSON Resume 双向适配器**即可接入整个生态。
10. **⚠️ 反面趋势：分数波动当升级诱导**。MyPerfectResume 改一个区块名，分数 89→70。**不要复制。**

---

## 5. 优化建议（针对现有实现的缺陷）

这些不是新功能，而是**当前实现的正确性问题**，建议先修：

### 5.1 PDF 导出（`src/hooks/usePdfExport.tsx`）

1. **同一张 `imgData` 在循环里反复 `addImage`** 是体积灾难——每页都嵌入了整幅长图。若暂时保留位图路线，至少每页用 `clip` 或先把 canvas 按页切成多张，只嵌入每页对应的部分。
2. 分页应在**语义边界**切（条目之间），而不是 `pageHeight` 像素位置；并让姓名/联系方式在续页重复。
3. **真修复方向见 §3.2.1**：换 `@formepdf/core`（首选）；过渡可先用 `@media print` + `@page` 原生打印拿到文字层。
4. **补 `assertPdfText` 断言**（§3.1.1）：导出后抽文字，为空或含替换字符就拒绝交付。这是唯一能防止"哪天又悄悄退化成位图"的机制。
5. ⚠️ **CJK 性能陷阱**：换引擎时必须确认支持**按文档子集化字体**，否则整字面中文字体内联会让每次导出耗时数秒、文件数 MB（Reactive Resume issue #3593 的教训）。

### 5.2 打印/展示视图

1. `src/components/ResumePrintView.tsx:40-50` 的 `getSectionGradient()` 是**未被调用的死代码**，且含被禁用的冷色渐变，应删除。
2. `ResumePrintView.tsx:101` 的字体栈改回 `Noto Serif SC`，与全站一致。
3. 抽出**共享的 section 类型判定**（现在 `ResumeDisplay`、`ResumePrintView`、`ResumeParser` 各写了一套 `isSkills` / `getSectionIcon` 的 `includes` 判断，三处逻辑会漂移）。

### 5.3 数据正确性

1. `src/lib/resume-builder.ts:74-82`：frontmatter 值统一做 YAML 安全转义（或改用 `js-yaml` 的 `dump`）。
2. `src/lib/resume-parser.ts:142-149`：非 ASCII slug 改用稳定的短哈希（如 `sha1(name+userId).slice(0,8)`），并加唯一性校验。
3. `src/lib/resume-parser.ts` 的技能拆分：支持全角逗号 `，`、顿号 `、`、分号 `；`、竖线 `|`。
4. 日期行解析：不依赖"必须已有 item"，并支持 `2022.03 - 至今`、`2022/03 - 至今` 等国内常见写法。

### 5.4 渲染

1. 引入正经的 Markdown 渲染（项目已依赖 `react-markdown` + `remark-gfm` + `rehype-raw`，但简历正文**没有用**）。段落内容应支持 `**加粗**`、链接、行内代码；导出的 PDF 同样要保留这些样式。
2. `src/app/globals.css` 中 `.resume-content` 整套样式当前无人使用，可复用到新的 Markdown 渲染器。

### 5.5 状态与交互

1. `src/components/ResumeEditor.tsx:78-80`：`useState` 初值捕获 `parsed`，父组件更新后不刷新。应改为受控或在 `parsed` 变化时同步（注意保护用户未保存的编辑，别直接覆盖）。
2. 编辑器应补：保存状态提示（"未保存/保存中/已保存"）、离开未保存拦截、快捷键（⌘S）、Undo/Redo。
3. 头像应支持**本地上传**（走 `/api` 上传），而非只填 URL——这同时解决 `crossOrigin` 导致 PDF 丢头像的问题。

### 5.6 工程质量

1. **加测试**。当前 0 测试文件，而 `resume-parser` / `resume-builder` 是纯函数、极易测，且是整条链路的正确性核心。至少覆盖：解析→编辑→回写 Markdown 的**幂等性**（`parse(build(x)) === x`）。
2. `src/components/ResumeEditor.tsx`（791 行）与 `AIUpload.tsx`（1031 行）应拆分。
3. `readSSEStream` 在 `AIUpload.tsx`、`AISectionChat.tsx`、`ResumeBuilderPage.tsx` **重复实现三遍**，应抽到 `src/lib/`。
4. 清理禁止项：`ResumeSourceView` 的冷色高亮、`globals.css` 中的 `.glass` / `.glow-primary`（`AGENTS.md` 已声明 `.glass` 已被替换，但样式仍在）。

---

## 6. 建议路线图

### 6.1 阶段一：正确性修复（1–2 周）—— 让产品"能用对"

| 事项 | 涉及文件 | 说明 |
|------|---------|------|
| **0. 先做判定实验** | 新 `*.test.ts` | 导出中文 PDF → `pdfjs-dist` 抽取文字 → 断言字符数 > 0。**当前预期失败**，这就是重构理由，同时成为永久防回归测试（见 §3.2.2） |
| **PDF 引擎换成 Forme**（首选） | `usePdfExport.tsx`、`ResumePrintView.tsx` | `@formepdf/core` + `harfbuzzjs` 按文档子集化，跑在 Web Worker；拿到矢量文字、页原生分页、孤寡行控制、PDF/UA。**过渡方案**：先用 `@page` + `break-inside: avoid` + 隐藏 iframe 原生打印，拿到文字层 |
| **`assertPdfText` 断言** | 新 `pdf-assert.ts` | 移植 Reactive Resume 机制：导出后抽文字，若为空或含 `�`/`?` 则**拒绝交付**该文件 |
| 分页语义化 | `ResumePrintView.tsx` | 条目级 `break-inside: avoid`，章节标题不与首条分离，续页重复姓名表头 |
| frontmatter YAML 转义 | `resume-builder.ts` | 消除含 `:` 值导致回读失败 |
| slug 稳定哈希 + 唯一性 | `resume-parser.ts` | 消除公开页覆盖风险 |
| slug → `ParsedResume` 解析健壮性 | `resume-parser.ts` | 技能分隔符（`，`/`、`/`；`）、日期格式（`2022.03`） |
| 引入 Markdown 渲染 | 新 `ResumeMarkdown.tsx` | 复用已有 `react-markdown` 依赖 |
| **纯文本 (.txt) 导出** | 新 `resume-text.ts` | 从 `ParsedResume` 生成 ATS 友好的纯文本；约 40 行 |
| **"解析器视角"预览** | 新 `AtsPreview.tsx` | 展示招聘系统能读到的内容 + 风险高亮；约 60 行 |
| **自动保存 + 保存状态提示** | `ResumeEditor.tsx` | 商业产品全线具备；当前只能手动保存，是门槛级缺口 |
| 清理设计规范违规 | `ResumePrintView.tsx`、`ResumeSourceView.tsx`、`globals.css` | 删冷色与死代码（`getSectionGradient`、`text-purple-400` 等） |
| 解析/回写幂等测试 | 新 `*.test.ts` | 安全网 |

### 6.2 阶段二：模板与内容模型（2–3 周）—— 让产品"好看"

| 事项 | 说明 |
|------|------|
| 引入 **JSON Resume schema 适配层** | `ParsedResume ↔ resume.json` 双向转换，接入生态 |
| **真正的多视觉模板** | 把模板从"内容种子"改为"渲染器 + 样式 token"。**第一套必须是单栏、无装饰图标、联系方式在正文区的 "ATS 安全" 款**（依据见 §2.1.1），再补双栏设计款 / 学术款 |
| **模板库改为按「求职阶段/用途」分面** | 校招 / 社招 / 实习 / 留学 / 考研复试 / 内推 —— 五百丁的 165 个「用途」分面与超级简历的赛道分类证明这比"按视觉风格"的网格好用得多 |
| **模板解析友好度标注** | 在模板卡片上标 高/中/低 解析友好度，让用户知情选择——零后端成本的信任设计 |
| **自定义样式面板** | 主色、字体（衬线/无衬线）、字号缩放、行距、页边距（对齐 Reactive Resume Custom Styles） |
| **中文特有字段 + 任意自定义字段** | 政治面貌 / 籍贯 / 民族 / 出生年月 / 婚姻状况 / 期望薪资 / 期望城市 / 求职意向 / 下属人数 / 离职原因；**并提供"添加自定义字段"**（简历本的做法） |
| **证件照工具** | 上传 → 裁剪（1:1 / 一寸 25×35mm）→ 换底色（白/蓝/红）→ 插入 frontmatter；附拍摄引导（纯色背景/深色服装/距墙 20cm） |
| 章节库扩充 | 证书/奖项/语言能力/发表/志愿/培训 + **校园经历 / 社团经历 / 学生干部 / 荣誉奖项 / 自我评价 / GPA 与专业排名** |
| **四个"一键"** | 一键一页纸自动收缩 · 一键全部经历自动倒叙 · 一键统一行距/页边距/主色 · 一键切换日期格式（职徒的四项，纯排版工程，体感极强） |
| 多语言与双语合并导出 | 中英两份 + 合并导出（职徒 10 秒/98% 的基准） |

### 6.3 阶段三：AI 差异化（2–3 周）—— 让产品"有理由被选"

复用现有 AI 网关（`/api/ai/chat`、多 provider、权限与配额），新增以下能力：

| 能力 | 实现要点 | 参考 |
|------|---------|------|
| **简历诊断（`analyze_resume`）** | 结构化输出：总分 + 分项评分（完整性/量化/动词/长度/关键词）+ 问题清单 + **一键修复按钮**（复用 `AISectionChat` 的 apply 机制），并可**重新评分**形成闭环 | 超级简历、Rezi、Resume Worded AutoFix |
| **JD 匹配（`match_resume_to_job`）** | 粘贴 JD → 提取关键词 → 命中/缺失对比 → 针对性改写建议 + 匹配度。进阶：不止匹配关键词，还匹配**职责与资格** | Teal、Huntr、超级简历 |
| **解析时区分「项目经历」/「工作经历」并自动归类** | 对应届生是"可用/不可用"的分界线（100分简历的核心技术基准） | 100分简历 |
| **ATS 自测** | 上传自己的 PDF（已有 `/api/ai/parse` 链路）→ 展示"招聘系统能读到什么"，并校验本项目自己导出的 PDF | OpenResume |
| 一页纸生成 | 结合阶段二的样式面板 | 超级简历 |
| Cover Letter / 求职信 | 复用简历数据 + 同一个 `ResumeEditor` 骨架 | Reactive Resume、Kickresume |

> ⚠️ **诚实性红线**：**评分必须可逐条解释**，且必须建立在"解析器实际能读到什么"之上，而不是"内容写得好不好"。MyPerfectResume 的 89→70 分数波动是明确的反面教材。Resume Worded 被批评"只评分内容、不开导出文件"——**不要重复这个错误，且这恰好是本项目的空档**。

### 6.4 阶段四：分享与增长（2 周）

- `sitemap.ts` / `robots.ts`、公开页 **OG image**（`ImageResponse`）、JSON-LD `Person` 结构化数据
- 公开页**访问统计**（浏览次数 / 下载次数 / 来源 / 最近访问）—— VisualCV 与 Standard Resume 都把这一项做成付费点
- **自定义分享 URL + 禁止搜索引擎收录开关 + 密码保护 + 有效期**
- **附件简历邮件投递**：转发到 HR 邮箱（链接 + 可选 PDF 附件），并明确说明"HR 会看到哪一份"—— 对标简历本，解决国内市场长期无人解决的 在线/附件 困惑
- 简历复制 / 逐岗位变体管理
- 二维码分享
- 导出 DOCX（用 `docx` 库；Canva 至今不支持，是可见空档）
- 游戏化引导清单（下载简历 / 查看 ATS 体检 / 获取诊断 / 创建求职信）

### 6.5 阶段五：平台化（可选）

- **MCP Server**（本项目已有权限模型 + AI 网关 + Markdown 存储，接 MCP 是自然的下一步；Rezi 与 Reactive Resume 均已上线）
- 开放 API（对齐 Reactive Resume 的 REST + Patch API）
- 求职进度 Tracker
- 面试准备 / 题库（**国内属门槛级功能**）
- 企业/高校渠道（本项目已有的用户体系 + 管理员审核 + 细粒度权限，本质上是 **B2B2C 能力**，而非纯 C 端功能——Rezi 企业版 $99/月/200 人可作参照）

### 6.6 变现与定位建议（基于本次调研）

调研得出的结论与直觉相反，值得单列：

| 结论 | 依据 | 对项目的含义 |
|------|------|-------------|
| ❌ **不要把"导出 PDF"当主付费墙** | FlowCV 免费层就给全部模板 + 无限无水印 PDF + 1 封 Cover Letter；Canva 做简历加下载永久免费；Kickresume 免费层含无限下载 | `can_export_pdf` 权限位应保留，但**不该作为唯一的商业抓手** |
| ✅ **把"ATS 安全的格式"设为免费档** | Resume.io / Zety / MyPerfectResume 的免费层**只给纯文本**——因为纯文本不值钱，**设计才值钱** | 免费 = 纯文本 + 干净单栏 PDF + ATS 体检；付费 = 设计款模板 + 双语 + 统计 + 诊断额度 |
| ✅ **"不做订阅"是定位武器** | Novorésumé 整个品牌建立在 "Pay once. No recurring billing."；Rezi 终身 $149；用户对"试用→每 4 周自动续费"的抱怨是该品类最大负面情绪 | 自托管 / 开源 / 一次性买断，天然契合 |
| ⚠️ **国内价格天花板很低** | 职徒 ¥88/年 · 100分简历 ¥12/月 · 锤子 ¥29.9/两年 · **WPS 稻壳 ¥87/年含整个办公套件（含简历模板）** | 纯简历订阅的定价空间极小；**国内用户期待终身买断档**（超级简历 ¥99.9 / 职徒 ¥96 / 五百丁 ¥180） |
| ✅ **按 AI 动作配额而非功能开关售卖** | 超级简历：10 次 PDF / 20 次改写 / 20 次分析 → 会员 50 → 终身 100 | 复用现有 AI 网关的配额能力即可实现 |
| ✅ **"能测不能下"是转化率最高的免费层设计** | Novorésumé 允许免费用户测试全部高级样式，只在下载时设墙 | 允许免费用户套用设计款模板并预览，仅导出时设墙 |

---

## 7. 一句话建议

> 本项目最稀缺的不是功能数量，而是**"导出的 PDF 在招聘系统里能被读懂"**和**"模板真的看起来不一样"**这两件基础事。先把这两件补齐，再把已有的 AI 基建升级成"ATS 体检 + 诊断 + JD 匹配"闭环——就已经超过了市面上绝大多数开源简历项目，并且正好落在国内市场**无人占据**的位置上。

---

## 附录：参考链接

**商业产品**

- [Reactive Resume 文档](https://docs.rxresume.org/getting-started) · [导出能力](https://docs.rxresume.org/guides/exporting-your-resume) · [源码](https://github.com/reactive-resume/reactive-resume)
- [超级简历 ClawCV AI 技能指南](https://www.wondercv.com/clawcv/api-guide) · [超级简历主站](https://www.wondercv.com/)
- [五百丁](https://www.500d.me/) · [简历本操作指南](https://www.jianliben.com/article/help/czzn/) · [乔布简历模板库](https://cv.qiaobutang.com/tpl/mo2-la1) · [职徒简历](https://apps.apple.com/cn/app/id1524420173) · [全民简历](https://www.qmjianli.com/)
- [Zety](https://zety.com) · [Resume.io 定价](https://resume.io/pricing) · [Novoresume 定价](https://novoresume.com/page/pricing) · [Enhancv](https://enhancv.com) · [Kickresume 定价](https://www.kickresume.com/en/pricing/) · [VisualCV](https://www.visualcv.com) · [Teal](https://www.tealhq.com) · [Rezi 定价](https://www.rezi.ai/pricing) · [FlowCV 定价](https://flowcv.com/pricing) · [Standard Resume 定价](https://standardresume.co/pricing) · [Resume Worded](https://resumeworded.com/score) · [Huntr 定价](https://huntr.co/pricing) · [Canva 定价](https://www.canva.com/pricing/)
- [智联职Q：在线简历 vs 附件简历](https://zq.zhaopin.com/answer/14237213/)

**开源项目**

- [reactive-resume](https://github.com/reactive-resume/reactive-resume) — 44k★，v6 用 Forme/WASM 取代 headless 浏览器；ATS 自解析；MCP server
- [OpenResume](https://github.com/xitanggg/open-resume) — `@react-pdf/renderer` 矢量导出 + ATS 解析器（⚠️ AGPL-3.0）
- [JSON Resume](https://jsonresume.org) — 标准 schema、52 套主题与注册表机制
- [RenderCV](https://github.com/rendercv/rendercv) — 17k★，YAML → Typst → PDF，主题为 YAML 声明
- [Forme](https://github.com/formepdf/forme) — Rust→WASM 的进程内分页 PDF 引擎（`@formepdf/core`）；文档 [docs.formepdf.com](https://docs.formepdf.com)
- [Paged.js](https://pagedjs.org) — 浏览器内 CSS Paged Media 分页（注意 [XWIKI-20359 性能警示](https://jira.xwiki.org/browse/XWIKI-20359)）
- [木及简历](https://github.com/hua1995116/react-resume-site) — Markdown + 「智能一页」；⚠️ 客户端硬编码云密钥，勿照抄
- [Resume-Matcher](https://github.com/srbhr/Resume-Matcher) — 28k★，AI 逐岗位裁剪
- [Typst 0.14 changelog](https://typst.app/docs/changelog/0.14.0/) — tagged PDF / PDF-UA-1 / PDF-A 与文本抽取修复
- Awesome-CV / moderncv / sb2nov/resume / Deedy-Resume / Jake's Resume — LaTeX 模板族
- brilliant-CV / chicv / modern-cv / imprecv — Typst 模板族

**ATS 与解析**

- [Recruiterflow：简历无法解析的常见原因](https://help.recruiterflow.com/en/articles/7996760-my-resumes-are-not-being-parsed)
- [Recruit CRM：Parsing Failed](https://help.recruitcrm.io/articles/3639421-parsing-failed)
- [psavidis/resume#38：PDF 无法被 ATS 读取（同型失败案例）](https://github.com/psavidis/resume/issues/38)
- [jsPDF 无法生成可选文本](https://stackoverflow.com/questions/77928881/selectable-pdf-creation-is-not-working-with-jspdf) · [《为什么 html2canvas 导出的 PDF 无法选中文字》](http://imd.oa22.cn/bbs.asp?id=37471)
- [合合信息：简历识别 OCR](https://www.intsig.com/news/jianli-shibie-ocr)

**数据可信度说明**

本报告中的**功能描述**与**开源仓库元数据**（stars / 推送时间 / 许可 / 源码片段）可信度较高，来自直接读取仓库与官方文档。而**商业产品的具体价格与模板数量**（尤其是国内厂商）多来自第三方横评或厂商自身营销页，存在以下已知冲突，**对外引用前应复核**：

- 五百丁终身会员：¥39.9（2022）→ **¥180**（2025-12），约 4.5 倍
- 超级简历月会员：¥19（2022）→ ¥19.9 起（2025-12）；终身 ¥99 → ¥99.9
- 职徒月会员：¥15（2022）→ **¥18**（App Store IAP）；终身 ¥93 → ¥96
- 锤子简历模板数：正文称"100+"，同文摘要称"40+"
- Kickresume 自称社会证明：定价页"70,455 位客户" vs 页脚"8,000,000 位求职者"，相差 100 倍
- Enhancv Pro 季付价在其官网页面上渲染为 `NaN`，**无法验证**
- Cultivated Culture、Google Docs 模板库官方模板数：**未取得可验证数据**
- Zety / MyPerfectResume / Teal / Resume Worded / Canva 的定价页阻挡了自动抓取，其数字来自标注日期的第三方拆解，**均为竞品撰写，含立场**
- OwlApply 的 ATS 解析统计（3,313 份样本）虽具体，但其框架服务于自家"文件级 ATS 检查"产品——**统计类别可用，营销结论需打折**
