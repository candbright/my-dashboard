# ResumeVault 平台重构 — 需求规格

- **Feature slug**：`resume-platform`
- **状态**：ready-for-agent
- **依据**：[`docs/research/resume-market-analysis.md`](../../docs/research/resume-market-analysis.md)（606 行市场调研）
- **决策**：[`docs/adr/0000-index.md`](../../docs/adr/0000-index.md)（10 条 ADR）
- **词汇**：[`CONTEXT.md`](../../CONTEXT.md)

---

## 1. 问题陈述

ResumeVault 在**内容模型**（Markdown 编写）与 **AI 对话式编辑**上已有差异化底子，但作为"简历产品"存在若干**正确性缺陷**，其中最严重的一条使产品在核心场景下不可用：

> **附件简历是无文字层的位图 PDF，招聘系统 100% 解析失败。**

其余问题按严重度排列：

| # | 问题 | 定位 |
|---|---|---|
| 1 | 附件简历无文字层 | `src/hooks/usePdfExport.tsx` |
| 2 | 视觉模板不存在（12 个"模板"共享一套渲染） | `src/lib/resume-templates.ts` |
| 3 | 无 ATS/诊断/JD 匹配能力 | 后端只有 `parse` 与 `chat` |
| 4 | 前端与后端各有一套 frontmatter 解析器，必然漂移 | `resume-parser.ts` / `resume.go` |
| 5 | 无并发控制，`PUT` 后写覆盖 | `resumes` 表无 `version` |
| 6 | 无自动保存、无跨会话版本历史 | `ResumeEditor.tsx` |
| 7 | 零打印样式（`@media print` / `@page` 全项目 0 处） | `globals.css` |
| 8 | 侧边栏 `section.content` 未渲染 Markdown，`**粗体**` 显示为字面字符 | `ResumeDisplay.tsx` |
| 9 | 后端 AI 解析按**字节**截断，静默损坏中文 | `ai.go` `maxChars = 20000` |
| 10 | 纯中文标题的 slug 退化为哈希；先查后插竞态返回 500 | `resume.go` `generateSlug` |
| 11 | 中文市场能力全线缺失（证件照、中文特有字段、项目/工作经历区分、一页纸） | — |
| 12 | 零测试基建（前端）、后端简历/审批/HTTP 层零测试 | — |

---

## 2. 目标与非目标

### 目标

1. **附件简历成为机器可读的文件**，且这一点被**持续断言**而非假设。
2. **模板第一次真的是模板**——视觉可变，且首套 ATS 安全。
3. **ATS 体检**成为无人占据的差异化位置：只报事实，不报分数。
4. **内容模型双层化**，消除双权威漂移与 YAML 转义类缺陷。
5. **中文市场地基**：中文特有字段、证件照、项目/工作经历区分、一页纸、双语导出。

### 非目标（明确排除，见 Q36）

| 排除项 | 理由 |
|---|---|
| 求职进度 Tracker | 是一个独立产品（Teal/Huntr 用整家公司做），不在此定位内 |
| AI 模拟面试 / 题库 | 需题库与音频链路，是另一个产品 |
| 开放 API | 无明确消费方 |
| 计费 / 配额阻断 | 定位为自托管工具；AI 用量只做展示与自省 |
| 企业版 / 多租户管理 | 会把项目从"自托管工具"推向"平台" |
| 岗位推荐（校招职位匹配） | 超出定位 |

**保留**：MCP server、Cover Letter、中英双语合并导出。

---

## 3. 已锁定的决策

| 编号 | 决策 |
|---|---|
| ADR-0001 | 阶段一浏览器原生打印止血（已实施）；**阶段四终态 = headless Chromium**（Spike 裁定，2026-10-13） |
| ADR-0002 | CJK 渲染**预注册 Spike 协议**（8 项判据，任一 FAIL 即走 Chromium）。**已执行：判据 5 失败 → Chromium** |
| ADR-0003 | 元数据进数据库列；简历文档不含 frontmatter；**frontmatter 降级为交换格式** |
| ADR-0004 | 展示态存 `resumes.presentation` JSONB |
| ADR-0005 | ATS 体检**只报事实，不报分数**；与内容质量严格分离 |
| ADR-0006 | 自研版本化迁移器；**迁移失败 → 拒绝启动** |
| ADR-0007 | 渲染收敛为 `RenderResume(结构化内容, 展示态) → (字节, 告警[])`；阶段一内联、阶段四独立 |
| ADR-0008 | 模板 = 渲染器 + 样式 token；**首套必须 ATS 安全**；标注解析友好度 |
| ADR-0009 | 授权为真相，可见性镜像为**派生缓存**；补复合索引；**不删列** |
| ADR-0010 | `version` 乐观锁 + 每次保存写完整 Markdown 快照；**不做自动合并** |

---

## 4. 交付阶段与可独立部署边界

**每一阶段结束时系统必须自洽**——不允许"必须等下一阶段才能上线"的中间态。

### 前置门禁（P0）

| 工单 | 说明 |
|---|---|
| [00 Spike：CJK 渲染](./issues/00-spike-cjk-render.md) | **已完成（2026-10-13）**：判据 5 失败 → 终态引擎定为 headless Chromium。测试文档已固化为常驻回归用例（`fixtures/`） |

### P1 止血 — 让产品「不再坏掉」

**部署边界**：纯前端改动 + 三个后端小修（可独立上线）。

| 工单 | 说明 |
|---|---|
| [01 建立前端测试基建](./issues/01-frontend-test-infra.md) | vitest + 首个断言 |
| [02 `assertPdfText` 运行时断言](./issues/02-assert-pdf-text.md) | 导出后抽文字，空则拒绝交付 |
| [03 浏览器原生打印导出](./issues/03-browser-print-export.md) | `@page` + `break-inside`，拿到文字层 |
| [04 分页语义化](./issues/04-semantic-pagination.md) | 条目级不断裂，续页重复姓名 |
| [05 Markdown 正确渲染](./issues/05-markdown-rendering.md) | 修 `section.content` 字面字符问题 |
| [06 纯文本 (.txt) 导出](./issues/06-plain-text-export.md) | 约 40 行，ATS 安全格式 |
| [07 ATS 体检界面（解析器视角）](./issues/07-ats-preview-ui.md) | ADR-0005 的一级 UI |
| [08 清理设计规范违规](./issues/08-design-violations.md) | 冷色渐变、非法语法高亮、死代码 |
| [09 列表硬上限](./issues/09-list-hard-limit.md) | 消除无界读取 |
| [10 后端 UTF-8 截断修复](./issues/10-utf8-truncation-fix.md) | **两行修复，正在损坏中文简历** |
| [11 版本化迁移器 + schema_migrations](./issues/11-migration-runner.md) | ADR-0006 |
| [12 `version` 列 + 乐观锁](./issues/12-version-optimistic-lock.md) | ADR-0010，**第一条迁移** |
| [13 slug 竞态修复](./issues/13-slug-race-fix.md) | 消除并发 500 |
| [14 自动保存](./issues/14-autosave.md) | 依赖 12 |
| [15 元数据表单编辑面板](./issues/15-metadata-editing-panel.md) | ADR-0003 |
| [16 内容版本历史](./issues/16-content-history.md) | **已完成（2026-10-13）**：`resume_versions` 表 + 迁移 v3 + 列表/预览/回滚（前端面板 + 3 个 RPC）。真实 Postgres 测试**证伪**了「单条派生集合 DELETE 足以强制上限」，改为 `pg_advisory_xact_lock` 按简历串行化；该结论已回写 ADR-0010 |

> **11–16 耦合说明**：`version` 列、`resume_versions` 表与元数据列属**同一批 schema 变更**，必须一次迁移交付（ADR-0006 的迁移器是它们的前置）。这是 P1 中唯一的后端结构性改动，其余后端改动（09、10、13）都是独立小修。

**P1 验收**：导出任意中文简历 PDF → `pdfjs-dist` 抽取字符数 **> 0**，且中文逐字正确 → 这个断言成为常驻测试。

### P2 结构化内容模型

**部署边界**：本阶段含**破坏性数据迁移**（frontmatter → 列），必须备份 + 灰度。

| 工单 | 说明 |
|---|---|
| [17 元数据迁入列，剥离 frontmatter](./issues/17-metadata-to-columns-migration.md) | ADR-0003 核心迁移，**破坏性** |
| [18 服务端解析器成为唯一权威](./issues/18-server-parser-authoritative.md) | 前端退化为非权威预览 |
| [19 展示态 JSONB 列 + 校验](./issues/19-presentation-state-jsonb.md) | ADR-0004 |
| [20 模板接口重构为渲染器 + token](./issues/20-template-renderer-refactor.md) | ADR-0008 |
| [21 首套 ATS 安全视觉模板](./issues/21-first-ats-safe-template.md) | ADR-0008 |
| [22 模板库按用途分面 + 友好度标注](./issues/22-template-gallery-facets.md) | ADR-0008 |
| [23 渲染服务接口（Chromium/Forme 实现）](./issues/23-render-service.md) | ADR-0007 阶段四形态，依赖 00 结论 |
| [24 自定义样式面板](./issues/24-style-panel.md) | 依赖 19 |

### P3 中文市场地基

| 工单 | 说明 |
|---|---|
| [25 项目经历 / 工作经历自动区分](./issues/25-project-vs-work-classification.md) | 应届生可用性分界线 |
| [26 中文特有字段 + 自定义字段](./issues/26-chinese-fields.md) | ADR-0003 延伸 |
| [27 证件照工具](./issues/27-id-photo-tool.md) | 裁剪 + 换底色 + 尺寸预设 |
| [28 一页纸自动收缩 + 自动倒叙](./issues/28-one-page-autofit.md) | 依赖 21/23 |
| [29 中英双语合并导出](./issues/29-bilingual-export.md) | 依赖 21 |
| [30 pg_trgm 搜索 + 分页](./issues/30-search-pagination.md) | ADR-0006 索引能力 |

### P4 AI 差异化

| 工单 | 说明 |
|---|---|
| [31 AI 诊断（`analyze`）](./issues/31-ai-analyze.md) | 内容质量，与 ATS 体检分离 |
| [32 JD 匹配（`match`）](./issues/32-ai-jd-match.md) | 含项目/工作经历语义 |
| [33 AI 用量记帐表](./issues/33-ai-usage-tracking.md) | 只展示不阻断 |
| [34 AI 提案式编辑（diff + 逐条接受）](./issues/34-ai-proposals.md) | 复用已有 `computeLineDiff` |

### P5 分享与增长

| 工单 | 说明 |
|---|---|
| [35 附件简历邮件投递](./issues/35-email-delivery.md) | 对标简历本；明确"HR 看哪一份" |
| [36 访问统计](./issues/36-view-analytics.md) | 报告列为高杠杆付费点 |
| [37 SEO：sitemap / robots / OG / JSON-LD](./issues/37-seo-discovery.md) | |
| [38 分享链接保护与有效期](./issues/38-share-protection.md) | |
| [39 DOCX 导出](./issues/39-docx-export.md) | 国内 HR 常见要求 |
| [40 简历复制与变体管理](./issues/40-variant-management.md) | |

### P6 平台化

| 工单 | 说明 |
|---|---|
| [41 MCP server](./issues/41-mcp-server.md) | 已有权限模型 + AI 网关，成本极低 |
| [42 JSON Resume 双向适配](./issues/42-json-resume-adapter.md) | 超集策略，接入 52 套主题生态 |
| [43 后端文档订正与安全基线](./issues/43-docs-correction.md) | 后端 AGENTS.md 已过期 |

---

## 5. 验收标准（全局）

| # | 标准 | 验证方式 |
|---|---|---|
| 1 | 导出的 PDF 有可用文字层 | `assertPdfText` 常驻测试；中文字符逐字正确 |
| 2 | 分页不劈开语义单元 | 目视 + 页数与条目边界断言 |
| 3 | 模板视觉确实不同 | 同一份内容套用 ≥2 套模板，输出**像素级不同** |
| 4 | 首套模板 ATS 安全 | 单栏 / 无图标 / 联系方式在正文 / 无版式表格（ADR-0008 四条） |
| 5 | ATS 体检只陈述事实 | 报告内**无合成总分**；每条风险可溯源到规则 |
| 6 | 无双重权威 | 全仓库只有一个元数据解析实现；frontmatter 只出现在导入导出路径 |
| 7 | 自动保存不丢内容 | 两标签页并发编辑产生 409 而非静默覆盖 |
| 8 | 迁移可重放且失败即停 | 迁移器测试；失败时服务拒绝启动 |
| 9 | 中文解析不被截断 | 上限是 **20,000 个字符（rune）**，不是字节。验证：**20,000 个汉字**（= 60,000 字节）输入后**不应出现截断提示**，且输出字符数 = 输入字符数。⚠️ 见下方注 |
| 10 | 设计规范零违规 | 无冷色、无 `shadow-md+`、无渐变背景（`.gradient-text` 除外）。**不要用裸 grep**——`ResumeSourceView.tsx` 与 `ResumeDisplay.tsx` 里都有解释"删掉了什么"的注释，会被误报。已由 `src/design-system.test.ts` 断言（先剥注释再扫描） |

> **判据 9 的原始措辞是有歧义的，且歧义正是缺陷本身。** 原文写「输入 > 20,000 字节的中文文本，输出字符数
> 等于输入字符数」——但 20,000 个汉字就是 60,000 字节，若**上限按字节算**，该输入必然被截断，这一条
> **在任何实现下都不可能同时成立**。工单 10 的真实缺陷正是把上限当字节用：中文用户实际只能写约 6,700 字，
> 且截断发生在 UTF-8 字节中间，产出非法字符串。
>
> 实现已按 **rune** 计（`truncateRunes`，`internal/service/resumevault/ai.go`），并有回归测试
> `TestContentLimitIsBytesAndCharsRegression` 直接钉住「20,000 汉字 = 60,000 字节 → 不截断、无提示」。
> 因此判据 9 以「字符」为准，**不要**按字节复述。

---

## 6. 风险与缓解

| 风险 | 严重度 | 缓解 |
|---|---|---|
| ~~Spike 判定 Forme 中文不可提取~~ | — | **已发生，但形式不同**：中文提取合格，判据 5（峰值内存）失败 → 选 headless Chromium（ADR-0002，2026-10-13） |
| frontmatter → 列 的破坏性迁移出错 | **高** | 迁移前全库备份；迁移函数**只加不删**；先在小库演练 |
| ~~Forme 是 pre-1.0 且单维护者~~ | — | **该依赖未被引入**（Forme 分支未选中） |
| 视觉模板工作量被低估 | **高** | 首套只做 ATS 安全款；数量不作为竞争维度（ADR-0008） |
| 表结构大改 + 迁移基建同时引入 | **高** | 迁移器先落地并用 ADR-0010 的 `version` 列验证端到端 |
| ~~`@formepdf/html` 不支持 CSS 变量~~ | — | **不适用**（Forme 未选中）；打印样式表仍**独立于 Tailwind token**，因其在浏览器打印路径中运行 |
| Chromium 容器体积与无 tagged PDF | 中 | 接受（ADR-0001）；`assertPdfText` 保证文字层，ATS 可读性不受影响 |
| 范围过大（"全都要"）导致中途停顿 | **高** | P1 完全独立可交付；每阶段结束系统自洽 |

---

## 7. 待定项（需后续决策）

| # | 待定 | 阻塞什么 | 建议时机 |
|---|---|---|---|
| TD-1 | 版本历史保留上限的**默认值** | 工单 16 | 已建议默认 50 + 配置项 |
| TD-2 | 渲染服务的**鉴权机制**（共享密钥 / mTLS / 仅内网） | 工单 23 | 与部署形态一并定 |
| TD-3 | 是否引入 **docker-compose** | 工单 23 的部署 | 渲染服务落地时 |
| TD-4 | 导出 `.md` 时**展示态如何处置** | 工单 42 | ADR-0004 建议省略 |
| TD-5 | 生产部署的 **JWT secret** 与**速率限制** | 无（但属安全缺口） | 建议独立小工单 |
| TD-6 | AI 聊天**每轮重发整份文档**的 4096 token 上限 | 工单 34 | 可能需改为增量上下文 |

---

## 8. 方法论备注

本规格由一次**五轮结构化的设计审问**产出（每轮先固定前沿问题、给出推荐答案、等待确认后再展开下一轮），并伴随两份后台代码调查：

- 开源生态调研（Reactive Resume / JSON Resume / RenderCV / OpenResume / Typst 等）
- `kratos-server` 代码级审计（schema、路由、AI 网关、权限、迁移、测试）

**凡涉及环境事实的，均查证而非假设**；凡属决策的，均由所有者裁定。

调研中的**数据可信度边界**见 [`docs/research/resume-market-analysis.md`](../../docs/research/resume-market-analysis.md) 附录末节——商业产品的价格与模板数量多为第三方横评，存在多处已知冲突，**对外引用前须复核**。
