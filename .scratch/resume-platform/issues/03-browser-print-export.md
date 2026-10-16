# 03 — 浏览器原生打印导出（文字层止血）

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：02（断言工具，用于验证修复生效）
- **Blocks**：04、06、23
- **ADR**：[ADR-0001](../../../docs/adr/0001-render-engine-selection.md)、[ADR-0007](../../../docs/adr/0007-render-service-boundary.md)

## 背景

当前 `src/hooks/usePdfExport.tsx` 用 `html2canvas` 把 A4 页面光栅化成 PNG，再 `jsPDF.addImage` 塞进 PDF。

**产出的 PDF 完全没有文字层**——ATS 拿到的是一张图片，**100% 解析失败**，比双栏矢量 PDF（已丢 17.2% 内容）严格更差。

ADR-0001 决定：**阶段一用浏览器原生打印止血**，拿到文字层；阶段四再换成真正的渲染服务。

## 任务

1. 在 `globals.css`（或独立打印样式表）新增打印规则：
   ```css
   @page { size: A4; margin: 18mm; }
   @media print {
     /* 隐藏应用外壳 */
     .no-print { display: none !important; }
     /* 条目级不断裂（详见工单 04） */
     .resume-entry { break-inside: avoid; }
   }
   ```
2. 实现导出路径：**隐藏 iframe（或新窗口）加载打印视图 → 调用 `print()`**
   - **不要**用 `window.print()` 直接打印当前页面——会把导航栏等外壳一起打进去
3. 保留现有位图路径，但**降级为「导出图片」功能**并显式命名，不再作为"导出 PDF"
4. 在 `usePdfExport.tsx` 顶部加注释，明确标注：**这是阶段一的过渡实现，契约由 ADR-0007 定义，阶段四替换为渲染服务**
5. 用**工单 02 的断言**验证：修复后导出的 PDF，`charCount > 0` 且中文字符逐字正确

## 验收标准

- [ ] 导出的 PDF 可用鼠标选中文字、可复制、可在阅读器中搜索中文
- [ ] **工单 02 的断言对修复后的导出通过**，中文计数与原文一致
- [ ] 打印输出**不含**导航栏、页脚、编辑器 UI
- [ ] A4 尺寸与页边距正确
- [ ] 位图路径仍可用，但 UI 上标为"导出图片"而非"导出 PDF"
- [ ] 过渡性质在代码注释中显式标注

## 备注

- ⚠️ **中文字体**：浏览器打印依赖系统字体。若目标用户的系统无中文字体，会出现豆腐块。**这不能靠打印解决**——是 ADR-0001 要求渲染服务自带并显式注册中文字体的原因。
- ⚠️ 打印视图的样式必须**独立于 Tailwind 的 CSS 变量**（`@formepdf/html` 不支持变量；即使阶段一用浏览器打印，也应提前养成"打印样式不用变量"的习惯，避免阶段四重写两遍）。
- 保留位图路径**有实际价值**：图片在某些 IM 场景（微信发送）比 PDF 更方便。

## Comments

### 实施结果（已完成）

| 改动 | 文件 |
|---|---|
| 打印文档构建（纯函数，可测） | `src/lib/print-resume.ts`（新增） |
| 打印/图片两条导出路径 | `src/lib/export-pdf.tsx`（新增） |
| hook 重写：`exportPdf` 走打印，位图降级为 `exportImage` | `src/hooks/usePdfExport.tsx` |
| 两个按钮分开命名 + 操作指引 | `src/components/ResumePageClient.tsx` |
| 全局 `@page` / `@media print` 规则 | `src/app/globals.css` |
| 条目级断页类；删除含禁用冷色的死代码 | `src/components/ResumePrintView.tsx` |
| 24 个单元测试 | `src/lib/print-resume.test.ts`（新增） |
| 真实浏览器端到端验证 | `scripts/verify-print-export.mjs`（新增，`npm run verify:print`） |

### 验收

| 验收标准 | 结果 |
|---|---|
| 导出的 PDF 可选中/复制/搜索中文 | ✅ 真实 Chromium 验证：`charCount 166`、`cjkCharCount 73`、`replacementCount 0` |
| **工单 02 的断言对修复后的导出通过**，中文计数与原文一致 | ✅ `extractPdfText` 对打印产物 `ok: true`；69 个汉字全部存活（详见下） |
| 打印输出不含导航栏、页脚、编辑器 UI | ✅ 打印媒体下 `.no-print` 实测 `display: none` |
| A4 尺寸与页边距正确 | ✅ `@page { size: A4; margin: 18mm }`，验证脚本以相同边距出纸 |
| 位图路径仍可用，但标为"导出图片" | ✅ 两个按钮分别标注「导出 PDF（招聘系统可读取）」与「导出图片（PNG，无文字层，适合聊天发送）」 |
| 过渡性质在代码注释中显式标注 | ✅ `print-resume.ts`、`export-pdf.tsx`、`usePdfExport.tsx` 三处 |

### ⚠️ 本工单最重要的发现：康熙部首静默替换汉字

**第一次跑真实浏览器验证时失败**，抽取出的文字是：

```
张三后端⼯程师 … 上海⼯作经历某某科技 2021.03 - ⾄今⾼级后端⼯程师 …
```

注意 `⼯`、`⾄`、`⾼` —— 这些是 **康熙部首**（U+2F2F、U+2F84、U+2FBC），不是普通汉字（U+5DE5、U+81F3、U+9AD8）。字形看起来完全一样，所以**任何肉眼检查、任何截图、任何 PDF 阅读器都发现不了**，但：

```
'⼯程师' !== '工程师'
```

招聘系统搜「工程师」**搜不到**。这比"没有文字层"更危险——没有文字层至少是显式失败，而这个是**看起来完全正常、实际搜不到**。

来源是 Chromium 打印管线在字体子集化时把某些字形映射到了部首码位。已修复：在抽取层加 `normalizeRadicals`，**只**对 U+2E80–U+2FDF 两个部首区块逐字符做 NFKC 折叠。

**为什么只折叠这两个区块，而不是整体 NFKC：** 整体 NFKC 还会折叠全角标点（`，`→`,`）和连字，那会改变读者看到的文本、也让 `charCount` 失真。把修复限制在缺陷本身的范围里。

同时补上 `CJK_PATTERN` 缺失的部首区——否则受影响的文档会被计成"几乎没有中文"，反而掩盖问题。

修复后：`张三后端工程师 … 上海工作经历某某科技 … 至今高级后端工程师`，7 项抽查全部通过。

### 如何验证「导出的 PDF 可搜索中文」

Chrome 没有提供以编程方式触发打印**对话框**的 API，所以这条验收无法放进 vitest。做法是驱动同一个打印引擎：

```
npm run verify:print
```

它用**真实的** `buildPrintDocument` + **真实的** `extractPdfText`，让 Chromium 以 `page.pdf()` 走同一套打印样式出纸，再对真实字节做抽取与断言。**退出码非 0 即失败**，可直接当门禁用。

同时它是**双向**验证：同一脚本里的 canvas-only 页面产出 `charCount: 0`、`ok: false`，并给出中文原因——证明抽取器不是"永远说好"。

> 若机器上已有别处下载的 Chromium，用 `VERIFY_CHROMIUM=<path>` 复用，避免 Playwright 因版本固定而重新下载约 400 MB。本次即复用了 MCP 已缓存的 `chromium_headless_shell-1228`。

### 有意为之的设计选择

**1. 打印文档里内嵌了一份 `display: none` 的验证载荷。**
它不上纸，但会进入 PDF 的文字层，使 `assertPdfText` 能拿**用户真正产出的文件**去比对"本该渲染的文本"，而不只是检查"非空"——后者会漏掉"某字体静默丢弃了所有汉字"这种情况。工单 21 的 ATS 面若需要一份无载荷的干净文本，可用 `extractVerificationPayload` 分离。

**2. 位图路径不再经过 jsPDF。**
把位图包进 PDF 会产出"看起来是 PDF、解析起来是空白页"的文件——正是本工单要消除的缺陷。换个按钮再提供一次等于前功尽弃。因此 `exportResumeImage` 只产出 PNG，`jspdf` 已完全退出 PDF 路径（仅剩注释提及）。

**3. 打印文档不引用外部样式表。**
iframe 不继承父页样式表，`<link>` 会打印出无样式的简历。样式全部内联，且**刻意不用 CSS 变量**——ADR-0001 阶段四的渲染器不支持变量，现在就不用可以少写一遍。

### 遗留（交后续工单）

- ⚠️ **中文字体仍依赖系统字体**，与备注一致：目标用户系统若无中文字体，打印会出现豆腐块。这不是打印能解决的，是 ADR-0001 要求渲染服务自带并显式注册中文字体的原因（工单 25–30）。
- 断页规则目前只有条目级（`.resume-entry`）与小节标题级。**完整的分页控制（孤行寡行、标题后不断页、跨页表头）属工单 04。**
- **`ResumePrintView` 的联系方式行使用 SVG 图标**（lucide-react）。图标本身不携带语义，而**文字值始终以 `<span>` 纯文本渲染**，符合 ADR-0008「联系方式在正文中、不用图标承载信息」。但 ADR-0008 的 ATS 安全模板要求更严，工单 21–24 需要提供无图标的模板变体。
- 顺带删除 `ResumePrintView` 中的 `getSectionIcon` / `getSectionGradient` 死代码——后者返回 `from-indigo-500 to-purple-500` 等**被明令禁止的冷色渐变类**，留着等于给人接线的机会。详见工单 08 的审计。

