# 05 — Markdown 正确渲染

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：01（测试基建）
- **Blocks**：—
- **ADR**：—

## 背景

`src/components/ResumeDisplay.tsx`（公开展示页，约 352 行）把 `section.content` **当纯文本渲染在 `<p>` 里**（约 214–218 行）。

后果：用户写的 `**粗体**`、`[链接](url)`、`- 列表项` 全部**以字面字符显示**。

而项目**已经装了** `react-markdown` + `remark-gfm` + `rehype-raw` + `rehype-highlight`（`package.json` 可见），只是没用在简历正文上。

`ResumePageClient.tsx` 与 `ResumeSplitEditor.tsx` 的预览路径也可能受影响。

## 任务

1. 新增 `src/components/ResumeMarkdown.tsx`——一个**受控的** Markdown 渲染器
2. 替换 `ResumeDisplay` 中的纯文本渲染
3. **渲染必须遵守设计规范**（`AGENTS.md`）：
   - 链接：`text-primary` + hover 过渡，不用蓝色
   - 列表：与其他文本一致的 `text-foreground`，紧凑行距
   - 粗体：`font-semibold`，不用纯黑
   - **不引入任何冷色调**
4. **安全**：`rehype-raw` 允许原始 HTML，必须确认**已做净化**（若将来内容是用户可控且公开的，这是 XSS 面）。若未净化，需加 `rehype-sanitize` 或收紧允许的标签
5. 检查 `ResumeSplitEditor` 的预览是否共用此组件；若各有一份实现，**收敛为一处**

## 验收标准

- [ ] `**粗体**`、`[链接](url)`、`- 列表`、`### 标题` 在公开页正确渲染
- [ ] 视觉效果符合 Natural Organic 规范（无冷色、无重阴影）
- [ ] 原始 HTML 的处理有明确的安全策略并记录
- [ ] Markdown 渲染逻辑**只有一处实现**
- [ ] 有测试覆盖：含 Markdown 语法的输入 → 输出包含对应 HTML 元素

## 备注

- 这是"用户能立刻看见的 Bug"，优先级高、成本低。
- 顺带检查 `ResumeSourceView.tsx` 的语法高亮配色——含被禁用的冷色（见工单 08）。

## Comments

### 实施结果（已完成）

| 改动 | 文件 |
|---|---|
| 新增统一渲染器 `ResumeMarkdown` | `src/components/ResumeMarkdown.tsx` |
| 净化策略（纯数据，独立模块） | `src/lib/markdown-sanitize.ts`（新增） |
| 替换公开页正文的纯文本渲染 | `src/components/ResumeDisplay.tsx`（正文 + 条目要点） |
| 48 个测试（净化 26 + 渲染 22） | `src/components/ResumeMarkdown.test.tsx`（新增） |
| 新增依赖 `rehype-sanitize`；`rehype-parse`/`rehype-stringify`/`@types/hast`（测试用） | `package.json` |

### 渲染逻辑确实只有一处

`ResumeSplitEditor.tsx:123` 已经在用 `<ResumeDisplay>`，`ResumePageClient.tsx:263` 也是。所以替换 `ResumeDisplay` 内部实现后，三条路径（公开页、编辑器预览、分享页）自动收敛到同一个组件，**不需要新建第二处实现**。

同时把**条目要点**（`item.details`）也接上了渲染——那是同一类 bug，只是工单没点出来：`**提升了** 3 倍` 之前同样以字面字符显示。因为要点是 flex 行内的一行文字，用 `inline` 模式渲染，避免块级 `<p>` 破坏项目符号布局。

### ⚠️ 安全策略：允许列表净化，不是禁止原始 HTML

工单要求"确认已做净化，若未净化需加 `rehype-sanitize`"。**实际状态是未净化**——`rehype-raw` 在依赖里，代码里根本没用到 markdown（`react-markdown` 也完全没被引用）。既然要引入，就必须连带净化。

**结论：保留 `rehype-raw`，紧跟 `rehype-sanitize` 的允许列表。**

选择保留原始 HTML 而不是整体禁止，理由：简历里 `<br>`、`sup`（脚注）、`sub` 是**正当且常用**的，一刀切禁止会让这些内容以字面字符出现，等于把同一个 bug 换个形式留下。允许列表的安全性来自"没列出的就删掉"，新发明的元素默认是危险的。

拒绝清单（`src/lib/markdown-sanitize.ts` 顶部有完整注释）：

- `<script>` `<style>` `<iframe>` `<object>` `<embed>` `<form>` `<base>` `<link>` `<meta>` `<svg>`
- 所有 `on*` 事件属性（`onerror`/`onload`/`onclick`…）
- `javascript:` `data:` `vbscript:` `file:` 协议
- `style` 属性（既绕过设计规范，`url()` 形式也是外泄通道）

### 过程中抓到三个真实缺陷（都写了回归测试）

**1. `protocols` 用嵌套形式会把安全配置变成漏洞。**
我最初按"标签 → 属性"的直觉写成 `protocols: { a: { href: [...] }, img: { src: [...] } }`。实测结果**反直觉且危险**：这个 key 匹配不到任何属性，于是整条配置被忽略，**并且它把 sanitizer 内置的危险协议表替换成了空**——`<a href="javascript:alert(1)">` 于是**原样通过净化**。

也就是说：**加一个写错形状的 `protocols` 配置，比完全不写这个配置更不安全。** 正确形式是按属性名索引：`protocols: { href: [...], src: [...] }`。测试 `blocks javascript: under the nested shape, proving the shape matters` 直接断言了错误形状会漏，`declares protocols by attribute name, not by tag name` 断言正确形状。

**2. `attributes` 里 `[['href','title']]` 会静默删掉 `href`。**
`a: ['href','title']` 是"允许这两个属性、值不限"；而多套一层方括号后，内层数组被当作**允许的值列表**，于是只有 `title` 属性因为值恰好等于 `"title"` 而留下，所有 `href` 被静默丢掉——**公开页上每个链接都变成纯文本，没有任何报错**。这个是靠"跑真实 rehype 管道"发现的：最初我用手搭 HAST 树测 schema，那样测通过了，而线上行为是坏的。测试已改为走真实管道。

**3. 这两个缺陷都无法靠"代码能编译/类型正确"发现。**
`satisfies Schema` 对两种错误形状都不报错，`tsc` 全绿。所以净化行为必须是**运行时断言**，代码注释里也点明了这一点。

### 验收

| 验收标准 | 结果 |
|---|---|
| `**粗体**`、`[链接](url)`、`- 列表`、`### 标题` 在公开页正确渲染 | ✅ 48 个测试覆盖；`ResumeDisplay` → `ResumeMarkdown` 已在构建产物中（`.next/static/chunks` 内可见渲染器代码） |
| 视觉效果符合 Natural Organic 规范（无冷色、无重阴影） | ✅ 断言输出不含 blue/purple/cyan/indigo/violet/fuchsia/teal、不含 `shadow-md/lg/xl/2xl`、不含 `bg-gradient-to-*`；链接用 `text-primary`，粗体用 `font-semibold text-foreground` |
| 原始 HTML 的处理有明确的安全策略并记录 | ✅ 允许列表 + 上述拒绝清单，注释见 `src/lib/markdown-sanitize.ts` |
| Markdown 渲染逻辑**只有一处实现** | ✅ 唯一实现在 `ResumeMarkdown`；三条使用路径共用 `ResumeDisplay` |
| 有测试覆盖：含 Markdown 语法的输入 → 输出包含对应 HTML 元素 | ✅ 48 个测试，含真实 rehype 管道与 `renderToStaticMarkup` 端到端断言 |

### 遗留

- **`ResumePrintView` 仍把 `section.content` 当纯文本**（`src/components/ResumePrintView.tsx:190`）。这是**有意的**：打印/导出路径要产出 ATS 可解析的纯文本层，把 `**粗体**` 渲染成 `<strong>` 对解析没有帮助，而工单 04 的分页逻辑依赖元素结构稳定。若将来要在 PDF 里也显示富文本，需要单独评估——两处行为不一致是**设计选择**，不是漏改。
- **`ResumeSourceView.tsx` 的语法高亮配色**含被禁用的冷色，属工单 08 范围，本工单未动（工单备注里已点名）。
- 没有做**真实浏览器视觉验证**。`ResumeMarkdown` 是客户端组件，需要一个挂载点；公开页 `/resume/[slug]` 要求后端有真实简历数据（当前后端列表为空）。现有验证手段是：真实 rehype 管道 + `renderToStaticMarkup` 端到端 + 构建产物确认。屏幕上的**像素**结果未经人工确认。
- `rehype-highlight` 仍未接入（工单未要求）。schema 已经预留了 `hljs-` 类名的位置，接入时无需改动净化配置。

