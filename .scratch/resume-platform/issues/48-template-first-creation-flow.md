# 48 — 模板优先的创建流程：风格 → 内容 → 编辑预览

- **Type**：task
- **Status**：done（本地未提交）
- **Blocked by**：20（模板注册表与渲染器）、22（画廊分面）、45（切换死锁）
- **Blocks**：49（打印分页的测量层缺陷，本工单的浏览器验证把它暴露出来）
- **ADR**：0008（模板 = 渲染器 + 样式 tokens；内容种子独立；ATS 安全优先）、0007（渲染档位 / 近似预览）、0004（`resumes.presentation` JSONB，整对象写入，`version` 仅 PATCH）、0003（元数据进列，正文不含 frontmatter）

> 编号：本工单原为 46，与 `46-ai-avatar-relative-path-blocks-save.md` 冲突，已改为 48。

## 背景

创建页原本是「起始页 + 编辑器」两阶段，起始页三张卡片是**上传文件 / 选择模板 / 空白创建**。其中「选择模板」实际含义是"从 12 份样例文档里挑一份"：它改的是**正文**，不动**外观**。于是用户点「选择模板」、挑了一张卡片，得到一个别人写的文档，而简历长什么样完全没变——这正是需求方指出的：

> 不同简历模板改变的应该是简历的 ui 风格，而不是实际内容

四条验收标准：

1. 选择模板明确简历风格（默认提供空白模板，即现有「空白创建」与浏览模板视图的效果；其他为带 UI 的模板）；
2. 上传文件或空白创建明确简历内容；
3. 编辑简历内容（**预览不再是预览 html 解析内容，而是预览带 UI 模板的简历**）；
4. 保存。

此外：html 解析的简历观看应作为创建流程之外的**独立功能**，且预览要像之前一样带上简历的**个人信息**。

### 顺带查出的 ADR-0008 缺陷（本次一并修）

渲染工作流在 Chromium 里量到：**全仓没有任何地方调用 `resolveTemplate` / `presentationFor`**。`ResumePrintView`（编辑器预览与 `export-pdf` 都走它）只做 `presentationFromRecord(resume.presentation)` 就收工。而该函数的职责是"把每个字段都填满"，因此它给出的对象**从未问过模板**：

- `{template: 'verdant-banner'}` 的简历渲染成产品默认的**石棕 `#5c4033` + 衬线**，绿野通栏的鼠尾草绿与 sans 永远到不了页面；
- `classic-centred` 的 `lineHeight: 1.6` / `pageMargin: 20mm` 同样是**看起来活着的死代码**；
- 每套模板渲染成同一份简历——正是 ADR-0008 §1 写下的那句「每套模板都会渲染成同一种棕色」。

这不是本工单的边角料：验收标准 1 与 3 都要求"选中的模板真的体现在预览里"，而这条路径不修，预览里体现不出来。

## 决策与理由

| 决定 | 理由 |
|---|---|
| **三阶段状态机** `style → content → editor`（扩展原 `Phase = 'start' \| 'editor'`） | 风格与内容是两个正交轴，界面必须让它们的顺序显式；风格在前，因为"先定版式再填内容"才不会让用户以为选模板会换掉正文 |
| 回退**不改动任何状态** | 从编辑器退到「内容」、再从「内容」退到「模板」，`markdown` / `parsed` / `metadataValues` / `CreationStyle` 全都不清空。四个内容入口只负责**替换**草稿，因此有草稿时显式给「继续编辑」，并写明四种方式会替换它 |
| 风格存在 `CreationStyle`（`templateId` + 用户选的 hex），展示态由 `creationPresentation()` 派生 | 选中的颜色与"实际会渲染的颜色"不是一回事：ADR-0008 的字段级规则把**等于默认值**的字段读作"没有意见"，于是模板自带的 token 会覆盖它。派生一次、全流程复用，避免预览/编辑器/保存载荷三处各算一遍 |
| 色板选中环与缩略图跟随**解析后**的颜色（`creationAccent`），并在带自带主色的模板下加一句说明 | 否则会出现"点了石棕什么都没变"，而载荷里其实记着石棕——静默的假控件比报错更难查。说明文案只在会发生的模板上出现 |
| 换模板时**重置**颜色为该模板自带主色 | 为上一套版式挑的颜色是对那套版式的决定 |
| 画廊**遍历 `TEMPLATE_METADATA`**，不硬编码列表/数量，第一项默认选中并标「默认」 | 绿野通栏就是在本工单进行中被追加进注册表的；ADR-0008 明确模板数量不是竞争维度。测试同样不写数量断言，只断言"等于注册表、顺序一致、第一项默认" |
| 「案例参考」用 `RESUME_SEEDS`（**内容种子**），卡片**不显示版式预览** | `CONTEXT.md` 明确：把种子叫「模板」正是让旧画廊"看着像选了设计、实际只选了文字"的原因。内容卡片一旦画出版式，用户就会拿它当设计来评判——而那个设计是第一步刚选的 |
| 内容入口四个：上传文件 / 空白创建 / 案例参考 / AI 智能解析 | 前三者对上验收标准 2，AI 解析是既有的第四条。上传与 AI 合并成一个面板的「模式开关」被拆成两张卡，共用的 `selectedFile` 状态与"文件优先于文本"的既有行为不变 |
| 编辑器预览改为 `ResumeTemplatePreview`：真实渲染器 + A4 分页 | 验收标准 3。**不使用 `dangerouslySetInnerHTML`**（全仓零使用）：改为"一份 flow、每页一个窗口"，`translateY(-offset)` + `overflow: hidden` 裁剪；分页规则由 `screenSheets` 承担，并与导出路径的 `paginateBlocks` 有**一致性测试**。窗口化而不是逐页重排，是因为逐页重排会改变断行位置，而"预览的断行 = PDF 的断行"才是预览的意义（ADR-0007 的近似预览） |
| 预览用**表单自己的占位符**补全空着的基本信息，保存路径仍用原值 | 验收标准要求预览带个人信息；空白简历没有姓名，模板头部就无从判断自己长什么样。占位符只在预览注入，`draftDocument()` 依旧读 `metadataValues`，并有测试钉住"占位符不进载荷" |
| 保存 = `POST /api/resumes` multipart，`presentation` 字段是**完整展示态的 JSON**（9 个 camelCase 键、**无 `version`**） | Go 侧 `handleCreateResume` 读 `decodeCreatePresentation(r.FormValue("presentation"))`。`presentationWriteBody()` 是 **PATCH 专用**（带 `version`），创建时发它会被 400 `INVALID_PRESENTATION`；因此创建载荷由 `creationPresentationField()` 独自产出，结构上不可能带 `version` |
| 保存成功后 `push('/resume/<slug>')`（取不到 slug 时退回 `/my` 并说明） | 创建完应该落在刚做出来的简历上。回复里没有 slug 时推空 slug 会变成 404 |
| 删除 `UploadPageClient` / `FileUpload` / `AIUpload` / `lib/resume-starters.ts` | 前三个是旧上传页的壳，`/upload` 早已渲染 `CreatePageClient → ResumeBuilderPage`，它们无人引用；`resume-starters.ts` 的 `ResumeStarter` 概念被 ADR-0008 拆成"模板（`resume-template.ts`）+ 内容种子（`resume-template-seeds.ts`）"，删除后无引用 |

## 状态机

```
        ┌──────────────────────────── 上一步：选择模板 ────────────────────────────┐
        │                                                                          │
   [style]  ── 下一步：填写内容 ──▶  [content]  ── 选内容四种方式之一 ──▶  [editor]
   ResumeStyleStep                  ResumeStartScreen                    ResumeSplitEditor
   = TemplateSelector               = 上传文件 / 空白创建 /               = ResumeEditor
     （模板 + 6 色）                   案例参考 / AI 智能解析                + ResumeTemplatePreview
                                       + 继续编辑（已有草稿时）              + 保存到本地 / 保存到平台
        ▲                                    ▲                                    │
        └──────── 更换模板（编辑器内）────────┴──────────── 返回 ────────────────────┘
```

- `style`/`content`/`editor` 之外没有别的阶段，页面标题下的步骤指示器是**只读**的（有具名动作就不需要第二个入口，而具名动作各自带守卫——例如解析进行中「上一步」是禁用的，否则流式输出无处可报）。
- 三个阶段的副标题与步骤标签：选择模板 / 填写内容 / 编辑预览。

## 改动

### 新增

| 文件 | 内容 |
|---|---|
| `src/lib/resume-creation.ts` | `CreationStyle`、`defaultCreationStyle`、`defaultCreationTemplate`、`creationTemplate`、`templateAccent`、`selectCreationTemplate`（同 id 原样返回；换模板则重置颜色）、`selectCreationAccent`、`creationPresentation`（= `resolveTemplate(template, {accentColor})`）、`creationAccent`、`creationPresentationField` |
| `src/lib/resume-screen-pages.ts` | 屏幕分页：`ScreenBlock` / `ScreenSheet` / `screenSheets`（与 `paginateBlocks` 同样的三条规则：空流给一页、**最后一页恒为整页高**、非末页按下一块起点裁剪）与 `measureScreenBlocks`（走 `data-print-section` / `data-print-flatten`，保留表头，标记标题块） |
| `src/lib/resume-preview-metadata.ts` | `PREVIEW_PLACEHOLDER_KEYS`、`previewMetadataValues()`：只填空字段，不改入参，**仅供预览** |
| `src/components/ResumeStyleStep.tsx` | 第一步外壳：一句话说明"模板决定版式与配色，不改内容"+ `TemplateSelector` + sticky 操作条（含"进入编辑器后仍可返回本步"） |
| `src/components/ResumeSeedGallery.tsx` | 案例参考画廊：`RESUME_SEEDS` 去掉 `blank`，卡片只有名称 + `seedSummary` 读出的那句 关于我 |
| `src/components/ResumeTemplatePreview.tsx` | 编辑器预览：真实渲染器 + A4 多页窗口化（见上）；`#resume-print-root` 只测第一份；后续页 `aria-hidden` |
| 测试 | `resume-creation.test.ts`(17)、`resume-screen-pages.test.ts`(19)、`resume-preview-metadata.test.ts`(7)、`resume-template-seeds.test.ts`(10)、`TemplateSelector.test.tsx`(7)、`ResumeSeedGallery.test.tsx`(4)、`ResumeStyleStep.test.tsx`(5)、`ResumeTemplatePreview.test.tsx`(7)、`ResumePrintView.test.tsx`(12) |

### 修改

| 文件 | 改动 |
|---|---|
| `src/components/ResumeBuilderPage.tsx` | 三阶段状态机；`CreationStyle` 状态与派生的 `presentation`；保存载荷追加 `presentation`；成功后跳 `/resume/<slug>`；回退保留全部状态；AI 解析状态机与 SSE/取消/超时/错误文案**原样保留**；步骤指示器（`aria-current="step"`，只读） |
| `src/components/ResumeStartScreen.tsx` | 从"整个起始页"改写为第二步「内容」：四张卡（`data-way`）+ 三个面板；保留 `ResumeFileDropzone`（键盘可达、`role=button`）、文件移除、"文件优先"说明、`AIParseProgress`（流式文本作为证据）、`StartFeedback`、**不给解析视图套 `AnimatePresence mode="wait"`**（工单 45 的死锁）；新增回到第一步与「继续编辑」 |
| `src/components/TemplateSelector.tsx` | 重写为纯画廊：props 改 `{selectedTemplateId, onSelectTemplate, accent, onAccentChange}`；卡片 `motion.button` + `data-template-id` / `data-selected`；「默认」徽章；解析友好度徽章（ADR-0008 要求）+ 分面；判定标准 `<details>` 移到网格**下方**；配色行 6 个色板（`data-accent`）+ 自带主色时的说明 |
| `src/components/ResumeSplitEditor.tsx` | 预览由 `ResumeDisplay` 换成 `ResumeTemplatePreview`；新增 `presentation` / `onChangeStyle`（「更换模板」）；窄屏用 `overflow-x-auto` + `w-fit` 横向滚动而非缩放（缩放会改变断行） |
| `src/components/ResumePrintView.tsx` | **ADR-0008 缺陷修复**：`presentationFromRecord` → `presentationFor(templateForPresentation(presentationFromRecord(stored), RESUME_TEMPLATES), stored)`。`photo` 走合并规则、`template` 永远来自注册表；调用方传入的（未保存的）展示态走同一条路径，因此预览与 PDF 不会各说各话 |
| `src/lib/resume-template-seeds.ts` | 新增 `SUMMARY_SECTION` / `SUMMARY_MAX_LENGTH` / `seedSummary()`（从文档里读出那句 关于我，52 字截断），供案例卡片使用 |
| 测试 | `ResumeStartScreen.test.tsx`（22）、`ResumeBuilderPage.test.tsx`（15，含三阶段与载荷）、`ResumePrintView.test.tsx`（新增） |

### 删除

`src/components/UploadPageClient.tsx`、`src/components/FileUpload.tsx`、`src/components/AIUpload.tsx`、`src/lib/resume-starters.ts`。

### 创建载荷（逐字）

`POST /api/resumes`，`multipart/form-data`：

```
content:      "---\nname: 李明\n...\n---\n\n## 关于我\n..."
filename:     "resume.md"
presentation: {"schemaVersion":1,"template":"verdant-banner","accentColor":"#557a46",
               "fontFamily":"sans","fontScale":1,"lineHeight":1.6,"pageMargin":"20mm",
               "sectionOrder":["关于我","工作经历","项目经历","教育背景","技能"],
               "photo":{"enabled":false,"path":null}}
```

9 个键、camelCase、**无 `version`**（有测试按"与 `DEFAULT_PRESENTATION` 的键集相同"断言，避免硬编码清单，同时显式断言 `not.toHaveProperty('version')`）。

## 验证

```
$ npx tsc --noEmit --incremental false
（无输出，exit 0）

$ npx vitest run --configLoader=native --pool=threads
 Test Files  48 passed | 1 skipped (49)
      Tests  1011 passed | 3 expected fail | 4 skipped (1018)
```

全绿。（本工单进行中曾在套件里看到 `src/lib/verdant-probe.tmp.test.ts` 失败——那是并行工作流的临时探针，它已自行删除；提出前再跑一次确认套件没有任何失败。）全仓 happy-dom 用例会向 stderr 打 `The current testing environment is not configured to support act(...)`，这是既有噪声（未设 `IS_REACT_ACT_ENVIRONMENT`），非失败。

```
$ npm run build
✓ Compiled successfully in 23.1s / Finished TypeScript in 10.7s / 14/14 static pages（exit 0）

$ $env:VERIFY_CHROMIUM="$env:LOCALAPPDATA\ms-playwright\chromium-1228\chrome-win64\chrome.exe"; npm run verify:template
 Test Files  1 passed (1)   Tests  4 passed (4)
   ✓ ATS 安全单栏 / 经典居中 / 绿野通栏
   PASS [verdant-banner] 字体族与 presentation.fontFamily 一致（sans → sans-serif）
   PASS [verdant-banner] PDF 页数与分页结果一致 — 2 vs 2
   （三个模板的文字层均可抽取中文、无 U+FFFD、含"李静 / 全栈开发工程师 / lijing@example.com / 某某科技 / 工作经历 / TypeScript"）
   （本次起还会打印「每页内容没有越过纸张下沿（像素）」一节：三份长简历的第 1 页分别越过内容框 41.2 / 75.5 / 86.7px，
     记为 SKIP 并在说明里指向工单 49；设 VERIFY_PAGINATION_STRICT=1 时它是失败断言。）
```

浏览器验证这一条尤其关键：它是"模板 tokens 真的到了页面"的**真实渲染证据**（此前正是这条路径上没有任何 `resolveTemplate` 调用）。

本工单新增/改写的用例全部通过：

```
✓ src/components/ResumeBuilderPage.test.tsx (15)      ✓ src/components/ResumeStartScreen.test.tsx (22)
✓ src/components/ResumePrintView.test.tsx (12)        ✓ src/components/ResumeTemplatePreview.test.tsx (7)
✓ src/components/TemplateSelector.test.tsx (7)        ✓ src/components/ResumeStyleStep.test.tsx (5)
✓ src/components/ResumeSeedGallery.test.tsx (4)       ✓ src/lib/resume-creation.test.ts (17)
✓ src/lib/resume-screen-pages.test.ts (19)            ✓ src/lib/resume-preview-metadata.test.ts (7)
```

真实浏览器验证与前端测试都**不连后端**（Go 侧行为由 `kratos-server` 的测试负责）；`/api/*` 在组件测试里一律 mock。

## 遗留

1. **编号**：已由 46 改为 48（`46-ai-avatar-relative-path-blocks-save.md` 保留原号）。
2. **注释里提到已删除模块的四处**：`src/lib/resume-template.ts:10,20`、`src/components/resume-render/index.ts:9`、`src/lib/line-diff.ts:4`、`src/components/ResumeHistoryPanel.tsx:8`。逐句核对后**都不需要改**——它们说的是「旧的东西是什么样」而不是「去看某个文件」（`line-diff.ts` 解释算法为什么被抽出来，`ResumeHistoryPanel.tsx` 解释这个面板取代了什么）。只有指向**未来**的引用（可打开的文件、可导入的符号、"见 X"）才算坏引用，全仓 grep 后没有这一类。`docs/audit-2026-10-14-readonly.md` 与 `docs/adr/` 是**有日期的记录**，其中的文件名在写下那天是真的，不改。
3. `45-animatepresence-wait-deadlock.md` 的站点表已**按当前代码重扫**（2026-10-15）：10 处 → 5 处，并标注了哪一处是已修的死锁。
4. 打印分页与页边距的缺陷（本工单的浏览器验证暴露）：已单独立为 **`49-print-margin-and-measure-width.md`**，含真实 Chromium 的逐页越界像素、`PAGE_MARGIN_MM` 硬编码、测量容器无宽度三件事。本工单**不改**分页代码。

