# 02 — `assertPdfText` 运行时断言

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：01（测试基建）
- **Blocks**：03、23
- **ADR**：[ADR-0007](../../../docs/adr/0007-render-service-boundary.md)

## 背景

ADR-0007 确定的机制：**导出 PDF 后立即抽取文字，若为空或含替换字符则拒绝交付该文件。**

这是全篇**最容易移植、收益最高**的一段代码（移植自 Reactive Resume，约 50 行）。它把"我们认为 ATS 安全"从一句营销词变成**一条可执行的断言**。

原实现（Reactive Resume `packages/pdf/src/forme/render.tsx`）：

```ts
export function assertPdfText({ missingFonts, warnings }) {
  if (missingFonts.length > 0)
    throw new Error(`Fonts could not be loaded: ${missingFonts.join(", ")}…`, { cause: "pdf-text-loss" });
  if (warnings.some(w => w.includes('was rendered as "?"') || w.includes("character(s) of source text did not render")))
    throw new Error("Some PDF text could not be rendered. Choose a font containing these characters…", { cause: "pdf-text-loss" });
}
```

本项目的形态不同（我们自己抽文字），但**意图完全相同**。

## 任务

1. 新增 `src/lib/pdf-assert.ts`（或渲染服务内的对应位置），导出：
   ```
   assertPdfText(bytes: Uint8Array): Promise<{ charCount: number; cjkCharCount: number; ok: boolean; reason?: string }>
   ```
2. 用 `pdfjs-dist` 的 `getTextContent()` 抽取全文并统计：
   - 总字符数
   - **中文字符数**（区分 CJK，因为这是本项目的目标）
   - 是否含 `�`（U+FFFD）或异常 `?`
3. 判定：`charCount === 0` 或含替换字符 → **抛错**，错误信息用中文且明确告知用户"该文件无法被招聘系统读取"
4. 集成到导出流程：**任何导出路径都不得绕过此断言**
5. 写入常驻测试：用一份**真实的**当前管线产出（位图 PDF）作为反例，断言其**失败**——这就是那个"5 分钟判定实验"的固化形式

## 验收标准

- [ ] 对**当前位图管线**产出的 PDF，断言**失败**且 `charCount === 0`（这是预期的、证明断言有效的反例）
- [ ] 对**有文字层**的 PDF，断言通过且中文计数正确
- [ ] 断言失败时用户看到中文错误提示，**不会拿到坏文件**
- [ ] 有常驻测试覆盖两个方向
- [ ] 不引入 `pdfjs-dist` 到首屏包（动态 import）

## 备注

- 这是**工单 03 的前置验证工具**：03 改完之后，用同一个断言证明修复生效。建议 02 与 03 一起验收。
- ⚠️ 若将来实例化 PDF.js 需要 worker，注意 Next 16 + Turbopack 下的 worker 加载方式（查 `node_modules/next/dist/docs/`）。

## Comments

### 实施结果（已完成）

| 改动 | 文件 |
|---|---|
| `extractPdfText` / `assertPdfText` / `analyseText` / `countCjk` | `src/lib/pdf-assert.ts`（新增） |
| 23 个测试（真实 PDF 字节，非 mock） | `src/lib/pdf-assert.test.ts`（新增） |
| 导出流程接入断言：先产出字节 → 断言 → 通过才交付 | `src/hooks/usePdfExport.tsx` |
| 修复调用方**吞掉导出错误**的缺陷 | `src/components/ResumePageClient.tsx` |
| `pdfjs-dist` 6.4.299 依赖 | `package.json` |

### 分层：事实与判定分开

ADR-0005 要求 ATS 面只报事实、不给分数，所以刻意分成两层：

- **`extractPdfText(bytes)` → 只报事实，永不因"不喜欢这份 PDF"而抛错。** ATS 报告可直接消费它。
- **`assertPdfText(bytes)` → 施加策略，不通过就抛中文错误。** 这就是"任何导出路径都不得绕过"的那道闸。

### 实测得到的关键修正（都是真跑出来的，不是推断）

**1. 图片型 PDF 的 `charCount` 原本是 1 而不是 0 —— 这个 bug 会让断言彻底失效。**
原因：我在页面之间插入了 `\n` 分隔符，而字符数统计把它算进去了。于是**位图 PDF 会被判为 `ok: true`**，也就是断言会**放过它本该拦住的那种文件**。改为只统计**非空白字符**后修复。这是本工单最重要的一处发现。

**2. `doc.destroy()` 在 pdfjs 6.4 的 legacy 构建里不存在**，teardown 属于 **loadingTask**。原本会让每次抽取都在 `finally` 里抛错。

**3. `isEvalSupported` 已从 `DocumentInitParameters` 移除**（tsc 报 TS2353）。

**4. 标准字体与预设 CMap 的路径必须运行时解析。** `new URL('pdfjs-dist/standard_fonts/', import.meta.url)` 在打包后正确，但在测试运行器里会解析到 `src/lib/` 下。改用 `import.meta.resolve('pdfjs-dist/package.json')` 推导，与打包位置无关。顺带接上 `cMapUrl`（`pdfjs-dist/cmaps`，169 个文件）——第三方 PDF 常用 `UniGB-UCS2-H` 这类预设 CMap 而非自带 `/ToUnicode`，缺了它们中文会抽成乱码。

### 测试夹具策略：测试期生成，不入库字体

真实 CJK 字体（`simhei.ttf`）有 **9.29 MB**，入库不可接受。于是：

- **文本型 PDF**：`jsPDF` 在测试期生成（已是生产依赖）。
- **图片型 PDF**：`jsPDF` + 手写的 67 字节 1×1 PNG，复现位图管线的产出形态。
- **CJK PDF**：**手工构造**带 `/ToUnicode` 的最小 PDF（Identity-H 约定：内容流放 2 字节字形码，CMap 把码位映射回任意 Unicode）。这精确隔离了被测的那一层——决定 CJK 能否存活的 CMap 往返——且不需要字体文件。

已验证该夹具真的能抽出中文：`简历中文张三`，`cjkCharCount: 6`。

### 验收

| 验收标准 | 结果 |
|---|---|
| 对**当前位图管线**产出的 PDF，断言**失败**且 `charCount === 0` | ✅ `charCount: 0`、`ok: false`、给出中文原因 |
| 对**有文字层**的 PDF，断言通过且中文计数正确 | ✅ 文本型 `ok: true`；CJK 型 `cjkCharCount: 6` 且文本逐字正确 |
| 断言失败时用户看到中文错误提示，**不会拿到坏文件** | ✅ 见下 |
| 有常驻测试覆盖两个方向 | ✅ 23 个用例，全部用真实 PDF 字节 |
| 不引入 `pdfjs-dist` 到首屏包（动态 import） | ✅ 见下 |

**关于「不会拿到坏文件」——顺带修掉一个让这条标准无法满足的缺陷。**
`ResumePageClient.handleExportPdf` 原本是：

```ts
try { await exportPdf(resume, parsed); } catch { /* error logged in hook */ }
```

**错误被完全吞掉**，用户视角是"点了导出，什么都没发生"。所以即使断言写好了，中文提示也永远到不了用户眼前。已改为 `addToast('error', err.message)`。

同时把交付方式从 `pdf.save()` 换成**先 `pdf.output('arraybuffer')` → 断言 → 通过后才触发下载**。`pdf.save()` 会立刻开始下载，没有任何可检查的时机。并且补上了失败路径的 DOM 清理——原先断言抛错会留下游离的离屏渲染节点。

**关于首屏包**：动态 import 生效。构建产物里含 pdf.js 的 chunk（`162amnrlpcw87.js`，479 KB）**不在页面引用的 script 列表中**，即按需加载。

### 当前行为（预期）

接入断言后，**当前的位图导出路径必然失败**——它产出的 PDF 本就没有文字层。用户会看到：

> 这份 PDF 没有文字层，招聘系统无法读取其中的内容。请改用「浏览器打印」导出（见导出选项），或联系管理员。

这是**正确的**：此前用户拿到的是一个 ATS 读不到的 PDF，而且毫不知情。工单 03 修好管线后，同一个断言会转为通过——这正符合备注里"02 与 03 一起验收"的设计。

### 遗留（不属本工单）

- **`standard_fonts` 告警**：pdf.js 在 Node 下无法通过 fetch 读取 `LiberationSans-Regular.ttf`（文件确实存在）。路径已修正，且这是 PDF 元数据读取的降级告警，**不影响文字抽取**——全部 23 个用例（含 CJK）均通过。浏览器/渲染服务环境中应正常。
- `pdf.js` 首次抽取有冷启动成本（约 200 ms，含 490 KB chunk 解析）。每次导出都会跑断言；若将来成为体感问题，可缓存动态 import 的模块引用。
- `usePdfExport.tsx` 有一个**既有** lint 告警（`createPortal` 未使用）。与本工单无关，保留不动以免混入不相关改动。

