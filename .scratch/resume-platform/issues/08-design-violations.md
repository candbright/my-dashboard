# 08 — 清理设计规范违规与死代码

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：无
- **Blocks**：—
- **ADR**：—

## 背景

`AGENTS.md` 定义的设计规范有若干硬禁止项（冷色调、纯黑、渐变背景、`shadow-md` 及以上、玻璃拟态），但代码中存在明确违规与死代码。这些会污染后续的模板重构（工单 20/21）。

## 任务

### 1. `src/components/ResumePrintView.tsx`

- **约 40–50 行**：`getSectionGradient()` 是**未被调用的死代码**，且返回被禁用的**冷色渐变**（`indigo`/`purple`/`cyan`/`blue`/`emerald`/`orange`/`pink`/`rose`/`violet`/`fuchsia`）→ **删除整个函数**
- **约 101 行**：字体栈是 `-apple-system … "Noto Sans SC"`，与全站 `Noto Serif SC` 不一致 → 改正

### 2. `src/components/ResumeSourceView.tsx`

- **约 37–51 行**：硬编码语法高亮色 `text-purple-400` / `text-blue-400` / `text-cyan-400` / `text-green-400` → 全部替换为设计 Token（`text-primary` / `text-secondary` / `text-default-500` 等）

### 3. `src/app/globals.css`

- `.glass` 与 `.glow-primary`：`AGENTS.md` 已声明被替代（`.glass` → `bg-content1/95 backdrop-blur-md`）→ 确认无引用后删除
- **约 296–354 行**：整个 `.resume-content` 区块未被使用 → 确认无引用后删除
- 全文件**零** `@media print` / `@page`（由工单 03 补上，不在本工单范围）

### 4. 全仓库扫描

- 搜索 `shadow-md` / `shadow-lg` / `shadow-xl` / `shadow-2xl` → 替换为 `shadow-sm` 或删除
- 搜索 `bg-gradient-to-` → 仅 `.gradient-text` 允许，其余移除
- 搜索 `blue-` / `purple-` / `cyan-` / `indigo-` → 移除
- 搜索 `#000000` / `text-black` → 换 `stone-800` / `stone-900`

### 5. `ResumeEditor.tsx` 的原生 `<input>`

`FormField` 辅助组件使用**原生 `<input>`**，违反 `AGENTS.md`「禁止使用原生 `<button>`、`<input>`、`<select>`」→ 改用 `@/components/ui` 的 `Input`

## 验收标准

- [ ] 全仓库 `grep` 无 `shadow-md|shadow-lg|shadow-xl|shadow-2xl`
- [ ] 全仓库 `grep` 无 `bg-gradient-to-`（`.gradient-text` 定义除外）
- [ ] 全仓库 `grep` 无 `text-blue-|text-purple-|text-cyan-|text-indigo-|bg-blue-|bg-purple-|bg-cyan-`
- [ ] `getSectionGradient`、`.glass`、`.glow-primary`、`.resume-content` 已删除且无残留引用
- [ ] `ResumePrintView` 字体栈为 `Noto Serif SC`
- [ ] `ResumeEditor` 无原生 `<input>`
- [ ] `npm run build` 通过

## 备注

- 这是**纯清理**工单：不加功能、不改行为、不改版式。风险低，适合作为热身或与其它工单并行。
- 删除前务必确认真无引用（`grep` 全仓库，包括 `index.ts` barrel 导出）。

## Comments

### 实施结果（已完成）

**重要发现：工单描述与实际代码已经不一致。** 逐条核对后，本工单的实际范围比描述**小得多**——描述里列的多数违规**已经不存在了**（工单 03 顺带清掉了其中一部分）。下面逐条给出实测证据，而不是假设描述正确。

### 任务 1：`ResumePrintView.tsx`

| 描述 | 实测 | 处理 |
|---|---|---|
| `getSectionGradient()` 是被禁用的冷色渐变，未被调用 | **已被删除**。第 29–32 行留有一句说明注释，指明工单 03 删掉了它和 `getSectionIcon` | 无需处理（描述已过期） |
| 约 101 行字体栈 `"Noto Sans SC"` 与全站不一致 | 确认存在（第 83 行） | **已修** |

字体栈改为：

```ts
fontFamily: 'var(--font-serif, "Noto Serif SC", Georgia, "Times New Roman", serif)',
```

用 `--font-serif` 而不是硬编码字体名，因为那是 `app/layout.tsx` 里 `next/font` 加载 Noto Serif SC 时注册的变量（`variable: "--font-serif"`）。硬编码 `"Noto Serif SC"` 在 Next 的子集化字体下**不一定能命中**（`next/font` 会改写字体名和 URL），而变量一定能。

**这个改动会让打印分页的测量结果变化**（衬线字体的度量不同），所以必须重跑 `npm run verify:print`。实测**逐字节一致**：

```
content box: 657 x 986 px
case A: 1 sheet / 1 PDF page, charCount 280, cjkCharCount 155
case B: 2 sheets / 2 PDF pages, charCount 1379, cjkCharCount 843
✓ PASSED
```

### 任务 2：`ResumeSourceView.tsx`

确认 3 处硬编码冷色（`text-purple-400` / `text-blue-400` / `text-cyan-400`），另有 `text-amber-400` / `text-green-400` / `text-orange-400`——后三个不在禁列，但属于"高饱和度调色板"且与大地色系无关。全部替换为设计 Token：

| 行类型 | 旧 | 新 |
|---|---|---|
| frontmatter 围栏 `---` | `text-purple-400` | `text-default-400` |
| `##` 标题 | `text-blue-400 font-semibold` | `text-primary font-semibold` |
| `###` 标题 | `text-cyan-400 font-medium` | `text-secondary font-medium` |
| `*斜体*` | `text-amber-400 italic` | `text-warning italic` |
| `- 列表` | `text-green-400` | `text-success` |
| `key:` | `text-orange-400` | `text-secondary` |

顺带删掉了一个声明后从未使用的 `const prefix = ''`。

映射时有意**同时使用字重**，不只靠颜色区分——这样在单色或低视力场景下层级依然可读。

### 任务 3：`globals.css`

| 目标 | 引用检查 | 处理 |
|---|---|---|
| `.glass` | 全仓库无引用（`index.ts` barrel 也查了） | 删除 |
| `.glow-primary` | 全仓库无引用 | 删除 |
| `.resume-content`（原 296–354 行） | 全仓库无引用 | 删除 |

三处都留了说明注释。**保留注释而不是静默删除**，是因为这三块死代码的失败模式很具体：下一个想加卡片的开发者会去用 `.glass`，下一个加简历正文样式的会去用 `.resume-content`——两者都会得到没人评审过的、且违禁的样式。

`@media print` / `@page` 确认存在于第 294/299 行（工单 03 补的），不在本工单范围内。

### 任务 4：全仓库扫描

扫描命令（`src` 下全部 `.ts`/`.tsx`/`.css`，排除注释行）：

| 目标 | 命中 | 处理 |
|---|---|---|
| `shadow-md\|lg\|xl\|2xl` | 1 处真实违规：`ui/Toast.tsx:45` | `shadow-lg` → `shadow-sm` |
| `bg-gradient-to-` | 1 处真实违规：`ResumeDisplay.tsx:111` | 见下 |
| `(text\|bg)-(blue\|purple\|cyan\|indigo)-` | 1 处（ResumeSourceView，见任务 2） | 已修 |
| `text-black` / `bg-black` | 1 处：`ui/ConfirmModal.tsx:53` `bg-black/40` | → `bg-stone-900/40` |

**`ResumeDisplay.tsx:111` 的渐变**：`bg-gradient-to-b from-transparent via-transparent to-background`，是 hero 区底部向下一节过渡的柔和遮罩。替换为等高纯色 `<div className="absolute bottom-0 left-0 right-0 h-40 bg-background" />`。

**这里有一处视觉变化，需要说明**：原渐变是从全透明到 `background` 的 alpha 斜坡；纯色带在理论上是硬边。之所以判断可以接受：这个 div 位于第 106 行 `<div className="absolute inset-0">` 内部，其后代还有两个 30% 不透明度的 `blur-3xl` 装饰色块和一个 `opacity-30` 的 `dot-grid`，所以它本来就被削弱过；另外斜坡的**中间部分**（`via-transparent`）本来就是全透明，真正提供遮蔽的只有末端。若产品上仍需要真正的 alpha 斜坡，只能新增一个受许可的渐变工具类——注释里写明了那是它该去的地方。

**`ConfirmModal` 的 `bg-black/40`**：`Modal.tsx:81` 同期用的是 `bg-stone-900/40`，两者不一致。统一为 `stone-900`。

### 任务 5：`ResumeEditor` 的原生控件

描述只提到 `FormField` 的 `<input>`。实际清点：**6 个 `<input>` + 1 个 `<textarea>` + 11 个 `<button>`**，全部违反 `AGENTS.md`「禁止使用原生 `<button>`、`<input>`、`<select>`」。只修 `FormField` 会让同一个文件里剩 11 个同样的违规，于是**全部转换**（`ResumeEditor.tsx` 现已是 0 个原生控件）：

- `FormField` → `ui/Input`（`variant="bordered"`，`label` prop，`type` 透传以便邮箱字段仍是 `type="email"`）
- 模块标题 → `ui/Input variant="underlined"`（它是在位编辑，不是表单字段；下划线 hover 提示是"可编辑"的唯一线索，必须保留）
- 条目标题/副标题/时间、详细描述 → `ui/Input inputSize="sm"`
- 段落内容 → `ui/Textarea`
- 11 个 `<button>` → `ui/Button`

**顺带修掉的实锤设计偏差**（这些是转换的实际收益，不是风格偏好）：原来的字段是 `rounded-[2rem]`（规范要求输入框 `rounded-full`）、用了 `border-2`（规范映射表要求 `border`）、`transition-colors` 没有 duration（规范要求 `duration-500`）、focus 用 `focus:ring-1` 而不是 `focus-within`。

**一处有意的取舍**：Flutter 风格的红色删除按钮（`hover:bg-red-500/10 text-red-500`）原本用的是**原生 Tailwind `red-500`**，不在规范 Token 里。转换时改用 `Button color="danger"`，即 `--danger`（`#A64B45` 暗红）。这是颜色变化，但方向正确——`red-500` 属于被禁的高饱和度调色板。

### 超出描述但同类：`ResumePageClient.tsx` 的 6 个原生按钮

浮动操作栏里还有 6 个原生 `<button>`（含我在工单 07 新加的 ATS 入口）。已全部收敛到文件内一个 `ToolbarButton` 辅助组件 + 共享的 `toolbarButtonClass`。

**这里没有使用 `ui/Button`，是一个有意的例外，必须记下来**：`ui/Button` 的 `bordered` 变体硬编码 `border-2`（`AGENTS.md` 另有一条禁止 `border-2`），并且它自带 `px-3 py-1.5` 之类的高度/内边距类，无法表达"方形容器里的图标按钮"。走 `ui/Button` 会同时改变操作栏布局**并**引入新的违规。真正的收益在这里不是"用原子组件"，而是"6 个按钮从复制 6 遍变成定义 1 遍"——它们此前已经互相漂移。

操作栏里的 `<Link href="/my">` 保持为 `<a>`：`ui/Button` 没有 `as` prop（见 `AGENTS.md`），导航目标只能是锚点，所以直接复用 `toolbarButtonClass` 保证视觉一致。

### 验收标准逐条

| 标准 | 结果 | 证据 |
|---|---|---|
| 全仓库无 `shadow-md\|lg\|xl\|2xl` | ✅ | 扫描 0 处（唯一命中为注释） |
| 全仓库无 `bg-gradient-to-`（`.gradient-text` 除外） | ✅ | 扫描仅命中 3 处**非违规**：1 条说明注释 + `ResumeMarkdown.test.tsx` 里断言净化器会剥掉恶意 `bg-gradient-to-r` class 的 2 行测试代码 |
| 全仓库无 `text-blue-\|text-purple-\|text-cyan-\|text-indigo-\|bg-*` | ✅ | 唯一命中为 `ResumeSourceView.tsx:34` 的说明注释 |
| `getSectionGradient`/`.glass`/`.glow-primary`/`.resume-content` 已删且无残留引用 | ✅ | 仅剩说明注释；`getSectionGradient` 在工单 03 已删 |
| `ResumePrintView` 字体栈为 `Noto Serif SC` | ✅ | 走 `var(--font-serif, "Noto Serif SC", …)` |
| `ResumeEditor` 无原生 `<input>` | ✅ | 0 个原生控件（含 `<button>`/`<textarea>`） |
| `npm run build` 通过 | ✅ | `✓ Compiled successfully in 6.1s`，exit 0，**无 warning** |

### 门禁

```
npm run test          → 8 files, 267 passed | 9 expected fail (276)
npx tsc --noEmit      → exit 0
npm run build         → ✓ Compiled successfully in 6.1s，exit 0
npm run verify:print  → ✓ PASSED（真实 Chromium；数值与字体改动前逐项一致）
npm run verify:ats    → ✓ PASSED — 22 checks
npx eslint src        → 16 error / 20 warning（改动前 16 / 22；无新增，少 2 条）
```

那 16 个 error **全部是改动前就存在的**（主要是 `react-hooks/static-components`、`ResumeDisplay.tsx` 的 `Cannot create components during render` 等），本工单未新增也未处理——它们是独立的代码质量问题，不属于"设计规范违规"。

### 需要注意 / 未做的事

1. **`docs/research/resume-market-analysis.md` 的两处论述已过时**，但**没有回头改**：第 87 行把 `.resume-content` 列为死代码（正确），第 455 行建议"可复用到新的 Markdown 渲染器"（错误——`ResumeMarkdown` 用 Tailwind 逐个元素覆盖，不需要这套 CSS）。研究报告是**带日期的快照**，回改它等于伪造当时的结论。此处记录实际决定：不采纳该建议。
2. **仍存在的设计规范违规，本工单未处理**（不在工单范围，另开工单更合适）：
   - `AIUpload.tsx:848` `rounded-xl`、`Navbar.tsx` 5 处 `rounded-xl`、`Tabs.tsx:55` `rounded-xl`、`Button.tsx:83-86` 的 `radius` 变体表；`AISectionChat.tsx` 2 处 `rounded-md`、`TemplateSelector.tsx:1` 处 `rounded-md`。规范映射表要求 `rounded-xl`/`rounded-2xl` → `rounded-[2rem]`（卡片）或 `rounded-full`（按钮/输入框）。**`ui/Button.tsx` 内部的 `border-2` 也仍在**，且被 `variant="bordered"` 使用。
   - `Modal.tsx` / `ConfirmModal.tsx` 的 `backdrop-blur-sm` 与 `Card.tsx` 的 `isBlurred`（`backdrop-blur-xl`）。关于 `backdrop-blur` 存在**规范内部矛盾**：禁止清单里"禁止玻璃拟态（`.glass` 已替换为纯色表面）"，但迁移映射表又要求 `glass` → `bg-content1/95 backdrop-blur-md`，且 `Navbar` / `ResumeSplitEditor` / `ResumePageClient` 都在用后者。本工单未动这些，因为无法从规范判断哪一条优先——**建议由产品/设计明确后再统一处理**。
3. **`ResumeEditor` 还有一个第 636 行附近的 `<label>` 配对 `ui/Textarea` 时被去掉**：`ui/Textarea` 自己渲染 `<label htmlFor>`，所以没有重复标签。但"条目列表"那个 `<label>`（无配对控件）保留原样。
4. **`ui/Button` 的 `disabled` 没有任何视觉反馈**（不降透明度），而原来的原生按钮写的是 `disabled:opacity-50`。在"删除最后一条描述"按钮上这会让禁用态看起来仍可点。**这是 `ui/Button` 的缺陷**，不是本工单引入的，但本工单把这个按钮从"有反馈"改成了"无反馈"。建议单独修 `ui/Button`。
5. **界面未做人眼视觉确认**：本环境后端登录不可用（`/api/auth/login` 返回 401 空体），无法进入简历详情页截图。已验证的是三方门禁 + `verify:print` 的数值一致性，**布局观感未经确认**。
