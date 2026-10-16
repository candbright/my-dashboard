# 49 — 打印分页的测量层：表头未预留、章节间距未计入、测量宽度不是 A4

- **Type**：defect
- **Status**：open（已加门禁，未修分页）
- **Blocked by**：—
- **Blocks**：—（但 48 的浏览器验证把它暴露出来，`PAGE_MARGIN_MM` 与测量宽度两处是 48 直接踩到的）
- **ADR**：0008 §2（模板硬性属性 / 打印契约）、0007（渲染档位）、0001（Phase 1 用浏览器打印管线）
- **证据日期**：2026-10-15（真实 Chromium 1228，`npm run verify:template` 的机器）

## 背景

打印导出走的是「在真实浏览器里量 → 用分页代码打包成 `pages` → 打印 `pages`」这条链（工单 21 建立）。这条链上有**三处测量错误**，都会让内容被塞进装不下的一页，而**门禁与文字层都看不见**：

1. **表头没有在分页预算里预留。** `paginatePrintRoot` 把姓名/联系方式块从正文流里**提出来**（`headerHtml`），`buildPrintDocument` 在**每一页**重新输出它；但 `paginateBlocks(flow, box.height, box.width)` 仍然把**整个内容高度**交给正文流，于是每页都按「没有表头」来填。
2. **章节之间的间距不计入任何块高。** 条目之间的间距按 AGENTS.md 的规矩用 CSS margin（`.resume-entry + .resume-entry`），所以它落在被测量的块上；但**章节列表用的是 flex `gap`**，`gap` 属于容器、不属于任何子元素，因此分页测量到的正文流比实际打印出来的纸面**少了每个章节边界那 22px**（打印文档里 `.resume-section-block + .resume-section-block { margin-top: 22px }` 是生效的）。
3. **测量宽度与页边距都锁死在 18mm 的常量上**，而模板的 `pageMargin` token 到不了这条路径：`export-pdf.tsx` 的 `PAGE_MARGIN_MM = 18`、`PRINT_RESUME_CSS` 的 `@page margin: 18mm`，而 `ResumePrintView` 在屏幕上用的是解析后的 `theme.pageMarginPx`（绿野通栏、经典居中都是 20mm）。另外 `prepareResumePrintDocument` 的离屏容器**没有任何宽度**，`#resume-print-root { width: 100% }` 于是按「收缩到适应」解析——量到的是文档最大内容宽，而不是 A4 内容宽。

第 1 条是这次新查出的；第 2 条与 ADR-0008/AGENTS.md 里条目那条规则同源，只是**章节**被漏掉了；第 3 条是 48 的浏览器验证顺带查出的（48 的编辑器预览用解析后的 20mm 和固定 794px，导出路径没有）。三者的后果是同一种：**一页被塞进装不下的内容**。

## 证据（真实 Chromium，9 段经历的长简历，`pageMargin` token 生效）

契约：A4 内容框 `a4ContentBox(18) = 657 × 986` px（`@page margin: 18mm` ⇒ 下边距 68.0px）。

| 模板 | 测量块数 | 分页/PDF 页数 | 表头高 | 第 1 页越过内容框 | 页面自带的 token |
|---|---|---|---|---|---|
| ats-safe-single-column | 18 | 2 / 2 | 149.4px | **+41.2px** | 18mm / serif / 1.5 |
| classic-centred | 15 | 2 / 2 | 178.4px | **+75.5px** | 20mm / serif / 1.6 |
| verdant-banner | 17 | 2 / 2 | 229.0px | **+86.7px** | 20mm / sans / 1.6 |

- 越过的部分先落进 **18mm 的下边距**里，超过 68.0px 的部分**直接出纸**：经典居中 7.5px（2.0mm）、绿野通栏 18.7px（4.9mm）——打印机还有自己的不可打印区，这两种都会**真的被裁掉**；ATS 安全单栏 41.2px 全部落在边距里，最后一行距纸边只剩 26.8px（7.1mm）。
  > **2026-10-15 更正**：这一条是从 **DOM 节点几何**推出来的，**在产物上不成立**——见下面「独立复核：真实 PDF 的文字层几何」。产物里没有任何字形越出内容框（三份 PDF、六页，0 个 run），所以「会被真的裁掉」这句需要撤回；剩下成立的是「量出来的包围盒确实越界」这个事实本身。
- **测量宽度**（同一份文档，出货路径的容器无宽度 → 按内容收缩）：ATS 安全单栏 **539.4px**、经典居中 **750.6px**、绿野通栏 **930.8px**，而 A4 内容宽是 **657px**。三个模板三个宽度，全部不是 A4——窄的会把行量**多**（高估块高），宽的会量**少**（低估）。这份 fixture 的行够短，两侧的总高恰好相同（各 1327.8 / 1462.7 / 1515.4px，差 0.0px），所以**宽度这一条我今天没能用高度差证明**；它是按 AGENTS.md 的规则与 `verify-template-browser.mjs` 自己的注释（它给 `#measure` 显式设了 A4 宽）应当修的一处。
- **表格栏「分页/PDF 页数」相等**：分页结果与 PDF 页数一致（这正是门禁今天唯一的分页判据）。**因此越界的内容既没有被移到下一页，也没有从内容流里丢掉**——它被画在本页的下边距里/纸外。文字层可证：三份 PDF 都 1403–1420 字符、CJK 889–899、U+FFFD 0，末条经历的「峰值每秒八千次写入」仍可抽取；按页查节点，第 1 页承载第 1–5 段经历，溢出的是第 1 页末尾那几个块，它们**留在第 1 页**。

### 我能证明什么、不能证明什么

- **能**：越界像素（上表，DOM 几何，量的就是被打印的那份文档、同一套 CSS）、PDF 页数与文字层的完整、溢出内容留在原页（既不换页也不丢失）。
- **不能**：**逐像素看那份 PDF 的边界**。这个会话的模型不接受图像输入，`analyze_regions` 的视觉 provider 也没有配置（`MCP_PDF_REGION_ANALYSIS_COMMAND` 等三个环境变量都为空），所以栅格化出来的页面没人看。上面「会出纸/会被裁」是由「越界像素 + `@page` 下边距」推出来的，不是看出来的；要闭环，需要一台有人眼或视觉模型的机器跑一次 `inspect render_page`。

### 独立复核：真实 PDF 的文字层几何（2026-10-15，pdfjs，不需要视觉）

「看不看得到」这件事其实不需要栅格化：文字层里每个 run 都带基线坐标，把 `viewport.transform`（把 PDF 的左下
原点翻成左上原点）作用到 `item.transform` 上，就能拿每个 run 的上下沿直接和**内容框底 791.9pt**（纸高 842.9pt
− 18mm 的 51.0pt）以及**纸边 842.9pt** 比。三份 PDF、逐页：

| 模板 | 页 | run 数 | 最深 run 距内容框底 | 距纸边 | 越出纸边 | 落进下边距 | 最左 run 的 x |
|---|---|---|---|---|---|---|---|
| ats-safe-single-column | 1 | 42 | −55.4pt | −106.4pt | 0 | 0 | 51.7pt |
| | 2 | 26 | −419.1pt | −470.1pt | 0 | 0 | 51.7pt |
| classic-centred | 1 | 45 | −45.6pt | −96.6pt | 0 | 0 | 51.7pt |
| | 2 | 41 | −293.1pt | −344.1pt | 0 | 0 | 51.7pt |
| verdant-banner | 1 | 45 | −37.4pt | −88.4pt | 0 | 0 | 51.7pt |
| | 2 | 41 | −241.4pt | −292.4pt | 0 | 0 | 54.7pt |

（负值＝在框内/纸内。三个模板第 1 页最深的 run 都是同一条经历描述「接入 PostgreSQL 分库分表…」，即页尾那个
块本身。纸的 MediaBox 实测 595.9×842.9pt。）脚本：`.scratch/zz-pdf-geom.mjs`（一次性诊断，可删）。

**结论一：产物里没有一个字形越出内容框。** 所以上面第 30 行那句「会被真的裁掉」不成立，须撤回；剩下的事实只有
「DOM 量出来的节点包围盒越界」。同一页上两个数字差了 **115–137px**（ATS 41.2+73.9、经典 75.5+60.8、绿野
86.7+49.9；DOM 的越界量换算成 px 加产物里的余量）。最省事的解释是**量的东西不同**：DOM 量的是**节点框**（含
padding、空容器、包裹层的 margin），而「被裁掉」说的是**字形**；也不能排除 Chromium 在打印时按自己的分页重排过
流。两者哪一个是主因，**下一步该做的是把探针与产物对齐，而不是照着一个与产物不符的数字去改分页**——因为改分页
会真的改变页数（内容提前一页开始），却可能修不到任何用户看得见的东西。

**因此 `MEASURE_SHEET_OVERFLOW` 不能就这么开成严格档**：严格档今天让三个模板全部失败，而它们的产物是好的——
那是一条**与产物不一致的代理断言**。要变成真门禁，先让它量产物：本节这段 pdfjs 几何可以直接搬进去（读
`page.pdf()` 的字节，断言每个 run 都在内容框内），既准确又不需要视觉模型。装饰性墨迹（背景块、分隔线）是否
贴到纸边仍未判——那确实需要栅格，但**文字不会丢**这一条已经确定。

**结论二（这一条是真的用户可见，且被产物证实）：`pageMargin` token 没有接到导出路径。** 三份 PDF 的最左 run 都在
**51.7pt ≈ 18mm**（含一点字形侧边距），连声明 `pageMargin: '20mm'` 的经典居中与绿野通栏也是。也就是说：

- **打印**永远是 18mm（`export-pdf.tsx` 里硬编码 `PAGE_MARGIN_MM = 18`，`@page` 用它）；
- **屏幕预览**老老实实按 token 走：`ResumeTemplatePreview.tsx:93` 用
  `a4ContentBox(pageMarginToMillimetres(presentation.pageMargin))` 算窗口，`resume-render/primitives.tsx:69` 用
  `theme.pageMarginPx` 给纸页加内边距（打印时才是 0）。

于是选经典居中或绿野通栏时，**预览的内容框是 20mm（617×957px），产物的是 18mm（657×986px）**——宽和高都不同，
换行位置与分页因此都可能不一样。这正是 ADR-0004「预览必须是那一份的预览」要防的事，也是本工单里**唯一**
已被产物证实、且用户当天就能看出的一处（预览与 PDF 边距不一致）。修它要同时动 `export-pdf.tsx` 与
`print-resume.ts`（`@page` 与 `buildPrintDocument`）并由解析后的 `pageMargin` 驱动，改完页数可能变，需要新断言覆盖。


## 门禁为什么看不见（已补）

`verify-template-browser.mjs` 原本只比**页数**，而页数在构造上必然相等（PDF 的页就是分页结果铺出来的），文字层又完整——所以它**不可能**因为这种事失败，正是 ADR-0008 记录的工单 21 那个陷阱的翻版。

现在每次 `npm run verify:template` 都会打印**逐页越界像素**：

```
=== 每页内容没有越过纸张下沿（像素，工单 49）===
  SKIP  [verdant-banner] 这一页的内容越过了内容框 — 第 1 页越过内容框 86.7px（@page 下边距 68.0px）；工单 49 未修（分页没有预留表头高度），设 VERIFY_PAGINATION_STRICT=1 让本项失败
  PASS  [verdant-banner] 这一页的内容都在内容框内 — 第 2 页越过内容框 -313px（@page 下边距 68.0px）
```

默认是 `SKIP`（免得给未修的缺陷挂一个红灯、挡住三个模板今天能用的产出），设 **`VERIFY_PAGINATION_STRICT=1`** 即为**失败断言**。它现在真的会失败，三个模板各一条：

```
  FAIL  [ats-safe-single-column] 这一页的内容越过了内容框 — 第 1 页越过内容框 41.2px（@page 下边距 68.0px）
  FAIL  [classic-centred]        这一页的内容越过了内容框 — 第 1 页越过内容框 75.5px（@page 下边距 68.0px）
  FAIL  [verdant-banner]         这一页的内容越过了内容框 — 第 1 页越过内容框 86.7px（@page 下边距 68.0px）
```

**修完分页后，把该开关的默认值改为 `true`（或干脆删掉开关）**，并把 README/AGENTS.md 里 `verify:template` 那条说明补上这一判据。

## 建议的修法（按顺序，每步都能被上面的断言判定）

1. **预留表头高度**（`src/lib/export-pdf.tsx`，本仓最有把握的一步）：

   ```ts
   export function paginatePrintRoot(printRoot: HTMLElement): PrintPage[] {
     const box = a4ContentBox(PAGE_MARGIN_MM);
     const headerHeight = measureHeaderHeight(printRoot);      // 第一个 data-print-role="header" 子元素
     const { headerHtml } = collectPrintBlocks(printRoot, measureBlockHeight);
     const flow = flattenPrintFlow(printRoot, measureBlockHeight);
     return paginateBlocks(flow, box.height - headerHeight, box.width)
       .map((page) => ({ ...page, headerHtml }));
   }
   ```

   注意 `paginateBlocks` 的第一个高度参数既用于预算也会写进 `page.height`（`.resume-page` 的行内高），所以要么新增一个「预算 vs 页高」两个参数的形态，要么在 `PrintPage` 上把 `height` 设回整页高；否则纸页本身会缩水，`.resume-page + .resume-page { break-before: page }` 会留下一个短页。

2. **把章节间距从 flex `gap` 改成可测量的 margin**（`src/components/resume-render/primitives.tsx`，**不在 48 的范围里**）：AGENTS.md 对条目已经这么要求，章节漏了。打印文档里已经是 `.resume-section-block + .resume-section-block { margin-top: 22px }`，把渲染器改成同样的 margin，测量与纸面就同源了。
   若不改渲染器，**替代方案**是在测量侧量「推进量」（`下一个块的 top − 本块的 top`，未块用自身高）：容器 `gap` 会自然计入，且不需要动渲染器——但它要求测量顺序与打印顺序一致，且要知道每个块的兄弟关系，比第 2 步脆弱，建议优先改渲染器。

3. **把解析后的页边距接到导出路径**（三处，必须同时改，否则分页与纸面又会不一致）：
   - `export-pdf.tsx`：`const marginMm = pageMarginToMillimetres(presentationFor(templateForPresentation(presentationFromRecord(resume.presentation), RESUME_TEMPLATES), resume.presentation).pageMargin) ?? PAGE_MARGIN_MM`，用它算 `a4ContentBox(marginMm)`，并把 `marginMm` 传给下面两处；
   - `buildPrintDocument` / `PRINT_RESUME_CSS`：`@page margin` 需要参数化（现在是常量 18mm），否则分页按 20mm 留白、纸面按 18mm 印，页数会偏多；
   - `prepareResumePrintDocument` 的离屏容器：`container.style.width = ${a4ContentBox(marginMm).width}px`——`verify-template-browser.mjs` 给自己的 `#measure` 就是这么做的，两处必须一致；
   - `verify-template-browser.mjs` 的 `PAGE_MARGIN_MM` 与 `page.pdf({ margin })` 同步换成解析值（今天它显式注释了「这是 pre-presentation fallback」）。

4. **页数变化的解释**：修完 1+2 后长 fixture 的页数**可能增加**（内容不再被塞进装不下的一页）。这是修正而不是回归：原先溢出的内容现在提前一页开始，且 `verify:template` 的「PDF 页数与分页结果一致」必须仍然成立。

## 复现与验证

```powershell
$env:VERIFY_CHROMIUM="$env:LOCALAPPDATA\ms-playwright\chromium-1228\chrome-win64\chrome.exe"
npm run verify:template                          # 打印逐页越界像素，仍应绿色
$env:VERIFY_PAGINATION_STRICT='1'; npm run verify:template   # 未修前应 3 个模板全部失败
```

48 期间用过的临时探针（`src/lib/pagination-probe.tmp.test.ts`，已删除）产出的三份 PDF 仍留在 `.scratch/pagination-probe/`（`ats-safe-single-column.pdf` / `classic-centred.pdf` / `verdant-banner.pdf`），用来复核上表。
