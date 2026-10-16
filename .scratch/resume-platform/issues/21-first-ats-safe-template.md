# 21 — 首套 ATS 安全视觉模板

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：20（模板架构）
- **Blocks**：23、28、29
- **ADR**：[ADR-0008](../../../docs/adr/0008-visual-templates-first-is-ats-safe.md)

## 背景

行业数据（ADR-0005 引用的 3,313 份简历数据集）：

| 丢失原因 | 占比 |
|---|---|
| 双栏布局 | **17.2%** |
| 装饰性图标 | **10.6%** |
| 联系方式放在页眉带 | 4.1% |
| 用表格做版式 | 0.7% |

而 Canva **最热门的简历模板恰恰是双栏 + 照片 + 图标**——即 ATS 最差的组合。

ADR-0008 的决策：**首套实现的视觉模板必须是 ATS 安全款。顺序是刻意的**——先做安全款再做设计款；反过来会导致用户默认选好看的那套，然后在 ATS 里悄悄丢内容。

## 任务

实现模板 `ats-safe-single-column`，硬性属性：

| 属性 | 值 | 依据 |
|---|---|---|
| 栏数 | **单栏** | 双栏丢 17.2% |
| 装饰性图标 | **无** | 图标丢 10.6% |
| 联系方式位置 | **正文区顶部**，不进页眉带 | 页眉带丢 4.1% |
| 版式表格 | **不用** | 表格丢 0.7% |
| 字体 | **必须嵌入并子集化** | 未嵌入字体是风险项 |

补充要求：

1. **`parseability: 'high'`** 标注
2. **章节顺序**遵循国内习惯（关于我 → 工作经历 → 项目经历 → 教育背景 → 技能），并可由展示态覆盖
3. **`accentColor` 默认 `#5c4033`**（石棕），且**只用于姓名与章节标题**——不影响可读性区域
4. 在**两个渲染路径**上验证：编辑器近似预览 + 渲染服务权威产出

## 验收标准

- [x] 单栏，无图标，联系方式在正文区
- [x] 无版式表格
- [x] 在两条渲染路径上输出一致（或差异已在文档中记录）
- [x] 用工单 02 的 `assertPdfText` 验证：中文可提取、无 `�`
- [x] 用**工单 07 的 ATS 体检**验证：风险清单为空或仅剩可接受项
- [x] `parseability` 标注为 `high`，且判定标准被写下来
- [x] 1 页与 3 页两种情况的输出都正确（分页不劈开条目）

## 备注

- 🌟 **这是整个重构的"可见成果"**：用户第一次能导出一份既好看又能被机器读取的简历。
- 建议同时把这份模板的产出**固化为回归测试的基准样本**——将来任何渲染改动都跑它。

## Comments

### 实现结果（2026-10-15）

模板本体在工单 20 中已随架构一起落地（`src/components/resume-render/ats-safe.tsx`）。本工单完成的是
**逐条核验硬性属性**，以及在这个过程中发现的、**让"分页不劈开条目"这一条实际上不成立**的两个真实缺陷。

#### 硬性属性核验（真实浏览器，`npm run verify:template`）

全部在**渲染产物**上断言，不是在 token 的声明上：

| 属性 | 判据 | 结果 |
|---|---|---|
| 单栏 | 产物无 `columns`、无 `float:`、无 `position:absolute` | PASS |
| 无装饰性图标 | 产物无 `<svg`、无 SVG 命名空间 | PASS |
| 联系方式在正文区 | `lijing@example.com` 在文档顺序中**晚于**姓名 | PASS |
| 无版式表格 | 产物无 `<table` | PASS |
| 字体 | 计算样式为 `"Noto Serif SC", Georgia, "Times New Roman", serif` | PASS |
| 1 页 | 1 份短简历 → 恰好 1 页，无 `hasOversizedBlock` | PASS |
| 多页 | 9 份经历 → 2 页，18 个测量块，无 `hasOversizedBlock` | PASS |
| 表头每页重复 | 每一页的 `headerHtml` 都含姓名与邮箱 | PASS |
| 文字层 | 1403 字符 / 889 CJK / **0 个 U+FFFD**，页数与分页结果一致 | PASS |

**「字体必须嵌入并子集化」这一条没有在本工单验证**，因为它不属于这里：浏览器自身的打印管线只会嵌入
它解析到的字体，不会做产品选择的子集化——ADR-0001 把这件事放在渲染服务（工单 23）。本工单验证的是
**字体族是衬线文档字面**，这是模板能负责的部分。

#### 发现的缺陷一：整份简历被静默压成一页

`export-pdf.tsx` 的 `flattenPrintFlow` 原本把**打印根的每个直接子元素**当作一个不可分割的块。工单 20
把模板改成三层结构——打印根 → 章节 stack → 条目 stack → 章节/条目——于是打印根的直接子元素只剩下
`header`、`hr`、**一个章节 stack**。结果：

- 整份简历是**一个**测量块，高度必然超过一页；
- 于是被判定为 `hasOversizedBlock`，独占一页；
- **布局完全正常，页数错误**。

这是最坏的一类缺陷：不报错、不崩溃、视觉上挑不出毛病，只有页数不对。而且**全部既有测试都通过了**——
`export-pdf.test.ts` 的用例都是手工搭 DOM，手工 DOM 里章节就在打印根下面、条目就在章节下面，永远符合
代码的预期。`npm run verify:print` 同样用手写 HTML，也发现不了。

修复：容器用 `data-print-flatten` 声明自己是"透明的"（只为排版而存在），遍历时下钻而不是测量它。三个
stack 都加了这个标记；`flattenPrintFlow` 改为递归。回归测试改为**渲染真实组件**再遍历它
（`export-pdf.test.ts` 的 `flattenPrintFlow against the real print view`），这是唯一能看见这类缺陷的方式。

#### 发现的缺陷二：条目间距不计入条目高度

条目之间的 14px 原本是容器的 flex `gap`。分页**逐个测量条目**，而 `gap` 属于容器，**不计入任何条目的
高度**——于是每一页都会被塞进实际放不下的内容。改为 `.resume-entry + .resume-entry { margin-top: 14px }`，
margin 会包含在条目自身的测量里（`measureBlockHeight` 已经处理 margin）。

#### 新增门禁说明

`npm run verify:template` 与 `verify:print` 的关键差别：后者用**手写**示例 HTML，前者渲染**真实组件**。
已写入 `AGENTS.md`，并写明"新增/修改模板后，`verify:print` 通过不能说明渲染路径没坏"。

### 验收命令结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run test` | **21 文件 / 712 通过 + 3 预期失败 + 1 跳过**，exit 0 |
| `npm run build` | `✓ Compiled successfully`，exit 0 |
| `npx eslint .` | **24 problems（14 errors / 10 warnings）**，低于基线 28 |
| `npm run verify:template` | **全部 34 项 PASS**，exit 0 |
| `npm run verify:print` | PASSED，exit 0（确认两套走查没有互相破坏） |

### 遗留

- **字体子集化**未验证，归工单 23（渲染服务）。
- 「两条渲染路径输出一致」目前由 `renderers.test.tsx` 的逐模板 `it.each` 覆盖（同一渲染器、两种
  `mode`）；真正的权威路径是工单 23 的渲染服务，届时需要把 `verify:template` 指向服务产出再跑一次。

