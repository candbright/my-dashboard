# 20 — 模板接口重构为渲染器 + 样式 token

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：19（展示态）、00（Spike 结论影响渲染路径）
- **Blocks**：21、22、23、24、28、29
- **ADR**：[ADR-0008](../../../docs/adr/0008-visual-templates-first-is-ats-safe.md)

## 背景

现有约 **12 个"模板"**（`src/lib/resume-templates.ts`，623 行），按类别分组，每套带 `id` / `name` / `description` / `category` / `accent` / `markdown`。

**但它们不是视觉模板——`markdown` 字段是示例内容。**

所有模板**共享同一套渲染**（`ResumeDisplay` 与 `ResumePrintView` 各只有一种设计）。用户选"UX 设计师模板"**只换掉了示例文字**。

行业基准：Reactive Resume 有 **17 套**真模板（React 组件 + 每套自带 `semantic.ts` 描述 CSS 钩子）；JSON Resume 有 **52 套**（npm 包 + 注册表机制）。

## 任务

1. **重定义 `ResumeTemplate`**：
   ```ts
   interface ResumeTemplate {
     id: string;
     name: string;
     description: string;
     facets: TemplateFacet[];        // 用途分面（见工单 22）
     parseability: 'high' | 'medium' | 'low';   // 解析友好度（ADR-0008）
     tokens: PresentationTokens;     // 默认样式 token
     render: TemplateRenderer;       // 渲染器
     sampleContent?: string;         // 示例内容（可选，不再是本质）
   }
   ```
2. **拆分** `ResumePrintView.tsx`（约 326 行）与 `ResumeDisplay.tsx`（约 352 行）为**可插拔的渲染器**，共享公共排版原语
3. **渲染器接收**：结构化内容（工单 18）+ 展示态（工单 19）
4. **token 与展示态的关系**：模板提供**默认值**，用户展示态**可覆盖**
5. **接口必须允许将来的注册表机制**（ADR-0008：短期不实现，但接口要留位）——即渲染器应是可外部提供的单元，而非硬编码在 switch 里
6. **模板数量不作为竞争维度**（ADR-0008）——本工单做**架构**，不做模板产能

## 验收标准

- [x] `ResumeTemplate` 的 `markdown` **不再是渲染的本质**，仅作可选示例内容
- [x] 渲染器可插拔，切换模板**产出视觉上不同的输出**
- [x] token 默认值可被展示态覆盖
- [x] `ResumeDisplay` 与 `ResumePrintView` 共享公共排版原语，无重复实现
- [x] 接口形态允许将来的外部注册
- [x] 现有 12 套"模板"的内容种子**不丢失**（迁移为 `sampleContent`）
- [x] `npm run build` 通过

## 备注

- ⚠️ **这是本计划最大的单点工作量。** 建议先只做架构 + 1 套真正的渲染器（工单 21），验证形态后再增产。
- 若工单 00 的 Spike 选了 Forme，渲染器可能是一套代码两处跑；若选 Chromium，**注意 CSS 在两处的差异**（ADR-0008 的代价项）。
- 打印路径的 CSS **不要依赖 Tailwind 的 CSS 变量**（`@formepdf/html` 不支持变量）。

## Comments

### 实现结果（2026-10-15）

**落地为三层，而不是一层。** 任务是"模板变成渲染器 + 样式 token"，实施中发现原 `ResumeTemplate`
把**三件独立的事**塞进了一个接口，解开之后每件都能单独演进：

| 层 | 文件 | 是什么 | 数量 |
|---|---|---|---|
| **模板** | `src/lib/resume-template.ts`、`src/components/resume-render/` | 怎么把内容排成页面 + 样式 token 默认值 | 2 |
| **内容种子** | `src/lib/resume-template-seeds.ts` | 示例 markdown（原 `markdown` 字段） | 12 |
| **起步项** | `src/lib/resume-starters.ts` | 种子 + 模板 + 强调色的入口组合 | 12 |

`样品内容` 不再是模板的属性，而是**可与任意模板组合的独立资源**——这条是验收标准第 6 条的自然
结论：12 套种子全部保留，但一套种子现在能配任何模板，而不是绑死在原来那一套上。

模板渲染原语在 `src/components/resume-render/primitives.tsx`（`ResumePage` / `ResumeHeader` /
`ResumeSectionBlock` / `ResumeEntry` / `ResumeSkillChip` 等），`AtsSafeResume` 与 `ClassicResume`
都只用这些原语，所以验收第 4 条（无重复实现）是结构上成立的，不是靠人工比对。

**两套模板的差异是布局，不只是颜色**：页边距 18mm vs 20mm、行距 1.5 vs 1.6、页眉左对齐 vs 居中、
技能用 chip 还是行内文本、证件照方形还是圆形。这是 ADR-0008 §4「分面按用途而非视觉风格」的
直接后果：光换颜色不算两套模板。

### 实施中发现的两个真实缺陷（都已修复，都有回归测试）

1. **模板 token 是死代码。** 详见 [ADR-0008 的实施记录](../../../docs/adr/0008-visual-templates-first-is-ats-safe.md)
   ——调用点做 `stored.x ?? token.x` 永远不会生效，因为展示态读取器会填满每个字段；而读接口对
   "什么都没存"的简历返回的是**与默认值逐字段相等的完整对象**，所以对象级的判定也救不了它。
   最终规则是**字段级**：字段仍等于默认值 → 模板赢；字段与默认值不同 → 用户赢。
2. **模板无法打开证件照。** `presentationFromRecord` 会丢弃"已启用但没有图片路径"的展示态
   （否则渲染坏图），顺带抹掉了用户的意图。`resolveTemplate` 改为从**原始存储值**读取 `enabled`。

这两个缺陷都属于同一类：**测试通过、类型正确、行为错误**。区别只在有没有把两份产物放在一起看，
所以回归测试断言的是**产物**（渲染后的内联样式、`padding:68.03px`），不是 token 的声明。

### 验收命令结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run test` | **21 文件 / 709 通过 + 3 预期失败**，exit 0 |
| `npm run build` | `✓ Compiled successfully`，exit 0 |
| `npx eslint .` | **24 problems（14 errors / 10 warnings）**，低于基线 28 |

新增测试：`src/components/resume-render/renderers.test.tsx`（28）、`src/lib/resume-template.test.ts`（26）、
`src/lib/resume-template-theme.test.ts`。断言的是产物而非声明，理由见上。

### 超出本工单范围、已记录未修

- **分页单位不匹配**：`export-pdf.tsx` 把 `data-print-section` 的每个子元素当作不可分割条目，而渲染器
  把区块内所有条目包在一个 flex 容器里 → 很长的"工作经历"是一个整体块，必然触发 `hasOversizedBlock`。
  14px 间距是 flex `gap` 而非条目 margin，按条目摊平会丢间距。**归工单 21。**
- **打印路径绕过 `ResumeMarkdown`**：`**粗体**` 与 `[链接](url)` 以字面量进入 PDF。
- **`scripts/extract-template-seeds.mjs`** 是一次性提取脚本（从旧 `resume-templates.ts` 抽 12 套种子），
  可删。保留是因为它是那 12 套种子**可复核的来源**；删除后种子的出处就只能靠 git 历史。

