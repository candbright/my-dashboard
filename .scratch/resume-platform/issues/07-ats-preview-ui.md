# 07 — ATS 体检界面（解析器视角）

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：06（纯文本渲染逻辑）、03（真实 PDF 供分析）
- **Blocks**：—
- **ADR**：[ADR-0005](../../../docs/adr/0005-ats-report-is-fact-only.md)

## 背景

这是本计划中**唯一无人占据的差异化位置**（市场调研 §4.2 排名第 1、第 5）。

行业现状的两种做法都推出了不应模仿的东西：

| 做法 | 代表 | 问题 |
|---|---|---|
| 只诊断内容质量，不看产出文件 | Resume Worded | 被批评"只评分内容、不开导出文件" |
| 给不透明分数 | MyPerfectResume | 改一个区块名，分数 89 → 70。**这是升级诱导** |

ADR-0005 决定：**ATS 体检是一个"解析可读性报告"，不是分数。一级 UI 是「提取文本」。**

## 任务

### 1. 一级 UI：提取文本

新增 `src/components/AtsPreview.tsx`。主体展示**招聘系统解析器实际读到的内容**——从产出文件中抽出的纯文本，逐段呈现。

复用**工单 06** 的 `resumeToPlainText`（不要在 07 里重写一份），并支持"实际从 PDF 抽取的文本"模式（用工单 02 的抽取能力）。

### 2. 二级：文件级风险清单

按严重度排序，**每条标注来源规则**：

| 风险 | 判定依据 | 判定时机 |
|---|---|---|
| 无文字层 | 抽取文本为空 | 立即可做（工单 02） |
| 字符渲染失败 | 含 `�` 或 `?` | 立即可做 |
| 联系方式落在页边距区域 | 文本坐标位于页边距框内 | 需版式分析 |
| 存在分栏 | 行聚类后检测到栏间空白 | 需版式分析 |
| 技能被图标化/图片化 | 该区域无文本但有图像对象 | 需版式分析 |
| 字体未嵌入 | PDF 字体引用缺失 | 需渲染告警（工单 23） |

> 数值参考（可展示给用户）：双栏导致 **17.2%** 内容丢失、装饰性图标 **10.6%**、联系方式置于页眉 **4.1%**。

**第一版可以只实现前两项**——它们已经能提供真实价值，且不依赖版式分析。

### 3. 严格边界（不可违反）

- ❌ **不给出合成总分**
- ❌ **不给出内容质量评分**（那是工单 31 的职责）
- ✅ 只陈述"文件里存在什么"

## 验收标准

- [ ] 界面明确展示"招聘系统读到了什么"
- [ ] 风险清单每条可**溯源到具体规则**（UI 上可见判定依据）
- [ ] **报告中没有任何形式的合成分数**
- [ ] 不依赖 AI 调用（纯本地/服务端计算）
- [ ] 对一份位图 PDF（旧管线产物）能正确报出"无文字层"
- [ ] 对有文字层的 PDF 能正确报出中文计数

## 备注

- ⚠️ **不要在文字层问题解决前发布这个功能**——在一个无文字层的产出上发布"ATS 体检"是自相矛盾的。
- 文案必须明确区分："解析可读性"（事实）vs 后续的"内容质量"（意见）。
- 若将来引入数字分数，必须满足 ADR-0005 的三个条件（完全由提取文本计算 / 每条可溯源 / 能为每次波动逐行辩护）。

## Comments

### 实施结果（已完成）

**新增文件**

| 文件 | 作用 |
|---|---|
| `src/lib/ats-report.ts` | 报告模型 + 规则评估（纯逻辑，无 DOM/React） |
| `src/lib/ats-analyse.ts` | PDF 字节 → 报告。从组件里抽出来的，见下 |
| `src/lib/pdf-fixtures.ts` | 与 `pdf-assert.test.ts` **共用**的真实 PDF 夹具 |
| `src/components/AtsPreview.tsx` | 界面 |
| `src/lib/ats-report.test.ts` | 28 个用例 |
| `scripts/verify-ats-report.mjs` | 真实字节验收脚本（22 项断言） |
| `scripts/alias-loader.mjs` + `scripts/alias-resolver.mjs` | 让 Node 脚本能导入 `@/*` 源码 |

**改动文件**：`src/components/ResumePageClient.tsx`（新增 `'ats'` 视图模式 + 工具栏按钮）、`src/lib/pdf-assert.ts`（见「顺带修掉的问题」）、`src/lib/pdf-assert.test.ts`（夹具改为共用）、`package.json`（`verify:ats`）、`AGENTS.md`。

### 复用，而不是重写（任务 1）

- 预览模式的文本**完全来自工单 06 的 `resumeToPlainText`**，`ats-report.ts` 只做统计和规则判定。因此预览与导出的 `.txt` **不可能不一致**——它们走同一条渲染路径。
- 文件模式的抽取**完全来自工单 02 的 `extractPdfText`**，`ats-report.ts` 只调用 `analyseText` 得到计数。`extractPdfText` 保持"不做判断"（ADR-0005 明确要求），策略留在 `ats-report.ts`。

### 两个模式的诚实边界

界面有「导出内容预览」与「检查已导出的 PDF」两态，报告上带 `source: 'pdf' | 'structured'` 字段，**UI 会明说当前是哪一个**：

- **预览模式**答的是"我们导出的 `.txt` 里会有什么"。它**无法**发现真实 PDF 里的字体缺失或字形丢失——文案里直接写了这一点，不假装。
- **文件模式**答的是"你手上这份文件里有什么"，是唯一可靠的判定。

**为什么文件模式是"上传"而不是"自动检查"**：ADR-0001 的一期实现走浏览器打印管线，而浏览器**没有**读取自己刚打印出的字节的 API——用户在对话框里点「另存为 PDF」，这一步我们观察不到。所以诚实的流程只能是：先导出，再把保存下来的文件交回来检查。这也正是真实 ATS 的工作方式（它分析你实际投递的文件）。

组件把「分析」做成**prop 传入已算好的报告**（`initialFileReport`）而不是在 `useEffect` 里自己发起：分析是异步且要 setState 的，放在挂载副作用里会触发级联渲染（仓库 lint 规则 `react-hooks/set-state-in-effect` 会直接报错），并且会在每次 prop 引用变化时重跑。用户主动选文件的那条路径仍然由组件自己处理。

### 二级风险清单：第一版做了 4 条（任务 2）

计划里"第一版可以只实现前两项"，实际落了 4 条，**全部只依赖抽取文本**，不需要版式分析：

| rule id | 严重度 | 判定依据（与代码一致） |
|---|---|---|
| `text-layer-missing` | blocker | `charCount === 0` |
| `glyph-loss` | blocker | `replacementCount > 0`（U+FFFD） |
| `question-mark-cluster` | warning | 除 U+FFFD 外还有成串 `?` 或紧邻中日韩字符的 `?` |
| `cjk-font-missing` | info | `charCount > 0 && cjkCharCount === 0` |

第 4 条**刻意降为 `info` 且措辞中性**：一份英文简历本来就不含中日韩字符，把它报成缺陷是误报。它的理由是"若这份简历本应含中文，说明字体没被正确嵌入"，并明说"若本来就是英文简历，此条可忽略"。

第 3 条单独于 `glyph-loss` 存在，因为信号更弱：单个 `?` 通常是标点，`looksLikeLostText` 只在形状有区分度时才判定。**宁可漏报，也不误伤一份正常简历**——这条取舍写在代码注释和 UI 的 `rationale` 里。

每条 finding 都带 `rule` / `severity` / `title` / `evidence`（含具体数字）/ `rationale`（以「判定依据：」开头，说明规则本身），UI 上**全部可见**。这正是"可溯源到具体规则"的落地方式。

未实现的 4 条（联系方式页边距、分栏、图标化、字体未嵌入）依赖版式分析或渲染告警（工单 23），**没有假装实现**。

### 严格边界：用测试和验收脚本钉住（任务 3）

ADR-0005 的边界是最容易被后人无意破坏的部分——加一个 `score` 字段太容易了。所以它由**两层**断言守住：

1. `ats-report.test.ts` 断言报告对象上**不存在** `score`/`grade`/`rating`/`percentage`/`total`/`overall`，finding 上不存在 `score`/`weight`/`points`/`penalty`/`deduction`，且顶层**除 `extracted` 与 `findings` 外不得有数字字段**。
2. `verify-ats-report.mjs` 的 case 5 对三种真实输入重复同一组断言。

`readable: boolean` 不是分数：它是"这份文件是否可读"的布尔事实（由 `charCount > 0 && replacementCount === 0` 得出），不是评价，也没有梯度。严重度分级（阻断/警告/提示）是 ADR-0005 后记里明确允许的"可解释的问题计数与严重度分级"，**不做加权、不做合成**。

文案上，"解析可读性"与"内容质量"是分开的两个词，UI 头部直接写"它只陈述事实，不评价内容好坏，也不给出任何分数"。

**不依赖 AI 调用**：`ats-report.ts` / `ats-analyse.ts` 只 import `pdf-assert`、`resume-text`，无任何网络或 AI 依赖。

### 验收标准逐条

| 标准 | 结果 | 证据 |
|---|---|---|
| 界面明确展示"招聘系统读到了什么" | ✅ | 一级 tab「提取文本」直接渲染抽取出的原文 + 4 个计数 chip |
| 风险清单每条可溯源到具体规则 | ✅ | 每条显示 `规则：…` + rule id + `evidence` + `rationale`；`every finding is traceable…` 用例 |
| 报告中没有任何形式的合成分数 | ✅ | 见上，两层按字段名断言 |
| 不依赖 AI 调用 | ✅ | 只依赖 `pdf-assert` / `resume-text` |
| 对位图 PDF 正确报出"无文字层" | ✅ | `npm run verify:ats` case 3：`charCount 0` → `readable false`，`text-layer-missing` @ blocker |
| 对有文字层的 PDF 正确报出中文计数 | ✅ | case 2：7 个中文字符 ⇒ `cjkCharCount 7`，`text` 含 `张三`/`工程师` |

### 门禁

```
npm run test          → 8 files, 267 passed | 9 expected fail (276)
npx tsc --noEmit      → exit 0
npm run build         → ✓ Compiled successfully in 6.0s，exit 0（无 warning）
npm run verify:ats    → ✓ PASSED — 22 checks，exit 0
npx eslint <改动文件> → 0 error 0 warning
```

`verify:ats` 的真实数据（不是 mock）：

```
case 1  Latin 文字层     charCount 23  cjk 0  replacement 0  readable true   findings: cjk-font-missing(info)
case 2  中文文字层       charCount 7   cjk 7  replacement 0  readable true   text "张三后端工程师\n"
case 3  位图无文字层     charCount 0             readable false findings: text-layer-missing(blocker)
                        evidence "从 1 页中抽取到 0 个非空白字符。"
case 4  含 U+FFFD        findings: glyph-loss(blocker)  readable false
case 5  边界             三种输入均无 score 类字段
```

### 顺带修掉的问题（超出本工单文件清单，但属同一路径）

1. **`src/lib/pdf-assert.ts` 里有一条死回退路径**，且 Turbopack 把它报成构建警告：

   ```
   Module not found: Can't resolve 'pdfjs-dist/' <dynamic> '/'
   → new URL(`pdfjs-dist/${name}/`, import.meta.url)
   ```

   裸包名不是合法相对路径，这条分支**永远不可能**解析成功，只是在把死代码变成构建噪音。已删除并说明原因；`import.meta.resolve` 是主路径且 Node/浏览器都支持。删除后构建警告消失（此前 `npm run build` 一直带这 1 条 warning）。**注意**：删除与本次改动无关地暴露了一个事实——该函数在浏览器里会返回 `undefined`（`import.meta.resolve` 在浏览器中能否解析裸包名未经证实）。`pdf.js` 对 `undefined` 有兜底（只影响标准 14 字体度量精度，实测抽取不受影响，见 case 1–4），但**浏览器端字体度量的真实影响未验证**，留待工单 23 连同渲染服务一起处理。

2. **夹具重复**：`pdf-assert.test.ts` 里的 3 个 PDF 构造器被复制到验收脚本会立刻产生"两份能够彼此漂移的夹具"。已抽到 `src/lib/pdf-fixtures.ts`，两处共用同一批字节。

3. **Node 无法解析 `@/*`**：验收脚本要导入真实源码，但 Node 不读 `tsconfig.json` 的 `paths`。选择加 `scripts/alias-loader.mjs`（Node loader）而不是把源码里的 `@/` 改成相对路径——后者会让源码偏离 `AGENTS.md` 的导入约定，只为迁就一个测试脚本。已写入 `AGENTS.md`。

4. **`.tsx` 无法被 `node` 剥离类型**，所以 `analysePdfFile` 从 `AtsPreview.tsx` 抽到 `src/lib/ats-analyse.ts`。这也顺带让抽取路径可被脚本驱动。

### 待办 / 需要注意

- **界面未做浏览器端视觉验证**。此环境的后端 `/api/auth/login` 返回 401 空体（seed 管理员数据不存在），拿不到简历也就到不了简历详情页，无法截图。已做的替代验证：`npm run build` 通过，且 `.next/static/chunks/14eza614dvrb-.js` 中确实含有 `ATS 体检` / `解析可读性` / `提取文本` / `风险清单` / `判定依据` / `行业参考数值`——组件确实进入产物且不阻断构建。**layout 的真实观感未经人眼确认。**
- `AtsPreview` 里仍有一个原生 `<input type="file">`（视觉上 `hidden`，只作为「选择 PDF」按钮的点击目标）。`AGENTS.md` 禁止原生 `<input>`，但 `ui/Input` 不接受 `accept`/`type="file"` 语义，且它不可见、不参与视觉规范。除此之外的按钮均已改用 `ui/Button`。**这是一个已知的规范例外。**
- 4 条依赖版式分析的风险留到工单 23；届时 `RenderService` 的渲染告警会新增 `font-missing` 等信号，`AtsRuleId` 需要相应扩展（`AtsRuleId` 是联合类型，扩展时会得到类型错误而不是静默漏判）。
- `cjk-font-missing` 目前对英文简历会稳定输出一条 `info`。若产品上认为这是噪音，可改为仅在"用户界面语言为中文"时评估。
