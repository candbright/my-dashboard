<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — my-dashboard

## Project Overview

**my-dashboard** 是一个基于 Next.js 的 ResumeVault 前端项目，采用 **StyleKit 自然有机风 (Natural Organic)** 设计风格，实现简历管理、上传、AI 解析、用户认证、管理员后台等功能。

- **Framework**: Next.js 16.2.6 (App Router, Turbopack)
- **React**: 19.2.4
- **CSS**: Tailwind CSS v4 (`@tailwindcss/postcss`)
- **Animation**: framer-motion 12.39.0
- **Icons**: lucide-react
- **Font**: Noto Serif SC (Google Fonts, 标题衬线字体)
- **Utility**: clsx + tailwind-merge (via `cn()`)

---

## UI 设计规范 — 自然有机风 (Natural Organic)

本项目采用 **StyleKit 自然有机风 (Natural Organic)** 设计语言，灵感源自自然界的大地色系、有机形状和手工质感。所有 UI 开发必须遵循以下规范。

> 参考来源: https://www.stylekit.top/zh/styles/natural-organic

### 核心理念

- **自然和谐**：色彩和形状来自自然界
- **温暖亲切**：让用户感到舒适和信任
- **手工质感**：避免过于工业化的冷感
- **可持续美学**：简约但不冷淡

### 色彩体系 (Design Tokens)

所有颜色通过 CSS 变量定义在 `src/app/globals.css`，并通过 `@theme inline` 注册为 Tailwind 颜色类。

| 语义 | Light 值 | Dark 值 | Tailwind 类 |
|------|---------|---------|------------|
| **Primary** | `#5c4033` (石棕) | `#8b9d77` (鼠尾草绿) | `bg-primary`, `text-primary`, `border-primary` |
| **Secondary** | `#8b9d77` (鼠尾草绿) | `#d4a373` (暖棕) | `bg-secondary`, `text-secondary` |
| **Success** | `#557A46` (森林绿) | `#557A46` | `bg-success`, `text-success` |
| **Warning** | `#C28A2E` (琥珀) | `#C28A2E` | `bg-warning`, `text-warning` |
| **Danger** | `#A64B45` (暗红) | `#A64B45` | `bg-danger`, `text-danger` |
| **Background** | `#faf6f1` (暖奶油) | `#1c1917` (深棕) | `bg-background` |
| **Foreground** | `#292524` (stone-800) | `#faf6f1` | `text-foreground` |

**表面层级 (Content Surfaces):**
- `content1` — 卡片/容器背景 (`bg-content1`), Light: `#faf6f1`, Dark: `#292524`
- `content2` — 次级表面 (`bg-content2`), Light: `#f2ece4`, Dark: `#1c1917`
- `content3` — 第三级表面 (`bg-content3`), Light: `#e9e0d4`, Dark: `#44403c`

**中性色阶 (default-50 ~ default-900):**
- 基于 warm stone 色系
- 用于边框 (`border-default-200` → `#e7e5e4`)、辅助文字 (`text-default-500` → `#78716c`)、悬停背景 (`bg-default-100` → `#f5f5f4`) 等
- Dark 模式下数值自动反转 (50↔900, 100↔800...)

**渐变 (仅限 .gradient-text):**
- `--gradient-start`: `#5c4033` (石棕)
- `--gradient-end`: `#8b9d77` (鼠尾草绿)
- 使用 `.gradient-text` 类实现渐变文字效果
- ⚠️ **禁止**在其他场景使用渐变背景 (`bg-gradient-to-*`)

### 设计原则

#### ✅ 必须遵守 (Do)
- 使用大地色系：stone、amber、olive、sage
- 背景使用温暖的奶油色 `bg-[#faf6f1]` / `bg-background`
- 使用有机圆角：`rounded-full`（按钮/输入框）、`rounded-[2rem]`（卡片/容器）
- 按钮使用柔和过渡：`transition-colors duration-500 ease-in-out`
- 使用衬线字体作为标题：`font-serif`（Noto Serif SC）
- 交互反馈：hover 加深土色层次（Soft Earth Press），不做漂浮弹跳
- 动画节奏：`duration-500` 以上 + `ease-in-out`（Botanical Slowness）

#### ❌ 绝对禁止 (Don't)
- **禁止使用冷色调**：蓝色 (`blue-*`)、紫色 (`purple-*`)、青色 (`cyan-*`)
- **禁止使用纯黑** `#000000`，使用 `stone-800` / `stone-900` 替代
- **禁止使用尖锐的几何形状**：`rounded-none`、`rounded-sm`
- **禁止使用高科技感的设计元素**：霓虹色、扫描线、终端风格
- **禁止使用高饱和度颜色**
- **禁止使用渐变背景**：`bg-gradient-to-*`（仅 `.gradient-text` 允许）
- **禁止使用重阴影**：`shadow-lg`、`shadow-xl`、`shadow-2xl`（最大 `shadow-sm`）
- **禁止使用玻璃拟态** (`.glass` 已替换为纯色表面)

### 间距与圆角规范

| 场景 | 圆角 | 说明 |
|------|------|------|
| 按钮 (Button) | `rounded-full` | 药丸形状 |
| 输入框 (Input/Textarea/Select) | `rounded-full` | 有机输入框 |
| 卡片 (Card) | `rounded-[2rem]` | 有机 blob 形状 |
| Chip / Badge | `rounded-full` | 药丸形状 |
| 小型图标容器 | `rounded-[2rem]` | 与卡片一致 |
| 对话气泡 | `rounded-[2rem]` + 尾部小圆角 | 有机对话 |

### 阴影规范

| 阴影级别 | 使用场景 |
|---------|---------|
| `shadow-none` | 默认（扁平有机感） |
| `shadow-sm` | 需要轻微层次时（悬停卡片等） |
| ❌ `shadow-md/lg/xl/2xl` | **禁止使用** |

### 动画规范

| 属性 | 值 | 说明 |
|------|-----|------|
| transition duration | `500ms` / `duration-500` | Botanical Slowness |
| transition easing | `ease-in-out` | 自然生长节奏 |
| framer-motion spring | `stiffness: 200, damping: 25` | 柔和的弹性动画 |
| 入场动画 duration | `0.5s ~ 0.7s` | 慢速淡入 |

### ⚠️ 类名对照表 (迁移映射)

如果遇到旧的 HeroUI 类名或硬编码值，按以下规则替换：

| 旧类名 / 值 | 新类名 / 值 |
|------------|------------|
| `rounded-xl` (卡片/容器) | `rounded-[2rem]` |
| `rounded-xl` (输入框/按钮) | `rounded-full` |
| `rounded-2xl` | `rounded-[2rem]` |
| `shadow-md` / `shadow-lg` | `shadow-sm` 或删除 |
| `shadow-xl` / `shadow-2xl` | 删除 |
| `glass` | `bg-content1/95 backdrop-blur-md` |
| `bg-gradient-to-br from-primary to-secondary` | `bg-secondary`（纯色） |
| `bg-gradient-to-r from-primary to-secondary` | `bg-primary`（纯色） |
| `duration-200` / `duration-300` | `duration-500` |
| `border-2` | `border` |
| `#006FEE` (旧 primary 蓝) | `#5c4033` (石棕) |
| `#7828c8` (旧 secondary 紫) | `#8b9d77` (鼠尾草绿) |
| `#000000` (纯黑) | `#292524` (stone-800) |
| `#ffffff` (纯白) | `#faf6f1` (暖奶油) |

---

## 组件架构

### 目录结构

```
src/
  components/
    ui/              ← UI 原子组件
      Button.tsx
      Input.tsx
      Textarea.tsx
      Card.tsx         (Card, CardHeader, CardBody, CardFooter)
      Chip.tsx
      Spinner.tsx
      Avatar.tsx
      Tabs.tsx
      Divider.tsx
      EmptyState.tsx
      Select.tsx
      Animations.tsx   (FadeIn, StaggerContainer, StaggerItem, ScrollReveal)
      index.ts         ← Barrel export
    layout/           ← 布局组件
      Navbar.tsx       ← 全局导航栏
      PageContainer.tsx ← 页面容器 (动画入场, title/subtitle/action)
      AuthGuard.tsx    ← 认证守卫 (requireAdmin 支持)
      index.ts         ← Barrel export
    [业务组件].tsx      ← 页面级业务组件 (ResumeCard, DashboardClient, etc.)
  hooks/
    useCountdown.ts    ← 倒计时 Hook (返回 [seconds, start] 元组)
    usePdfExport.tsx
  lib/
    cn.ts              ← className 合并工具 (clsx + tailwind-merge)
    api-client.ts
    types.ts
    ...
  contexts/
    AuthContext.tsx
  app/
    globals.css        ← 设计 Token 定义
    layout.tsx         ← 根布局 (Navbar, 字体)
    ...
```

### 导入约定

```tsx
// ✅ 正确：通过 barrel 导入 UI 组件
import { Button, Input, Card, CardBody, Spinner } from '@/components/ui';
import { PageContainer, AuthGuard } from '@/components/layout';
import { cn } from '@/lib/cn';

// ❌ 错误：直接导入具体文件
import { Button } from '@/components/ui/Button';
```

### UI 组件 API 规范

#### Button
- **variants**: `solid` | `bordered` | `flat` | `ghost` | `light`
- **colors**: `default` | `primary` | `secondary` | `success` | `warning` | `danger`
- **sizes**: `sm` | `md` | `lg`
- **props**: `isLoading`, `isIconOnly`, `isDisabled`, `startContent`, `endContent`
- **注意**: 不支持 `as` prop，需要链接用 `<Link>` 包裹

#### Input / Textarea
- **variants**: `flat` | `bordered` | `underlined`
- **props**: `label`, `errorMessage`, `startContent`, `endContent`

#### Card
- **variants**: `bordered` | `shadow` | `flat`
- **props**: `isHoverable`, `isPressable`, `isBlurred`
- **子组件**: `CardHeader`, `CardBody`, `CardFooter`

#### Chip
- **variants**: `solid` | `bordered` | `flat` | `dot`
- **colors**: `default` | `primary` | `secondary` | `success` | `warning` | `danger`

#### Tabs
- **variants**: `solid` | `bordered` | `underlined` | `light`
- 带 framer-motion 指示器动画

#### Select
- **variants**: `flat` | `bordered` | `underlined`
- **props**: `label`, `errorMessage`, `options: { value, label }[]`

#### Spinner
- **sizes**: `sm` | `md` | `lg`
- **colors**: `default` | `primary` | `secondary` | `success` | `warning` | `danger`

#### Avatar
- **sizes**: `sm` | `md` | `lg`
- **props**: `name` (自动生成首字母), `src`, `isBordered`

#### EmptyState
- **props**: `icon`, `title`, `description`, `action` (ReactNode)

#### Animations
- `FadeIn` — 渐入动画容器
- `StaggerContainer` + `StaggerItem` — 列表交错动画
- `ScrollReveal` — 滚动触发动画

### 布局组件规范

#### PageContainer
```tsx
<PageContainer
  title="页面标题"
  titleAccent="高亮部分"     // 渐变色
  subtitle="副标题说明"
  action={<Button>操作</Button>}  // 右上角操作按钮
  maxWidth="4xl"            // 默认 6xl
>
  {children}
</PageContainer>
```

#### AuthGuard
```tsx
// 要求登录
<AuthGuard>{children}</AuthGuard>

// 要求管理员
<AuthGuard requireAdmin>{children}</AuthGuard>

// 自定义重定向
<AuthGuard redirectTo="/login">{children}</AuthGuard>
```

---

## 编码规范

### 样式规则

1. **始终使用设计 Token**：禁止硬编码颜色值，使用 `bg-primary`、`text-default-500`、`border-default-200` 等
2. **`cn()` 合并类名**：条件类名使用 `cn(baseClass, condition && 'extra-class')`
3. **暗色模式**：通过 CSS 变量自动适配，不使用 `dark:` 前缀（Token 在 `@media (prefers-color-scheme: dark)` 中自动切换）
4. **间距与圆角**：遵循自然有机风规范（`rounded-full` 用于按钮/输入框，`rounded-[2rem]` 用于卡片/容器）
5. **阴影**：最大 `shadow-sm`，禁止 `shadow-md/lg/xl/2xl`
6. **有机表面**：使用 `bg-content1/95 backdrop-blur-md` 替代 `.glass`
7. **渐变文字**：使用 `.gradient-text` 工具类（仅此场景允许渐变）
8. **动画过渡**：统一使用 `duration-500 ease-in-out`，禁止快速动画

### 组件开发规则

1. **使用 UI 原子组件**：禁止使用原生 `<button>`、`<input>`、`<select>`，统一使用 `Button`、`Input`、`Select`
2. **认证保护**：需要登录的页面用 `<AuthGuard>` 包裹，禁止在页面内手动检查 `user` 状态
3. **页面结构**：所有页面使用 `<PageContainer>` 提供统一的标题区域和动画入场
4. **空状态**：列表为空时使用 `<EmptyState>` 组件
5. **加载状态**：使用 `<Spinner>` 组件，按钮加载使用 `isLoading` prop
6. **动画**：列表使用 `StaggerContainer` + `StaggerItem`，卡片入场使用 `FadeIn`
7. **倒计时**：验证码等场景使用 `useCountdown()` Hook，返回 `[seconds, startFn]` 元组

### 错误信息

- 用户可见的错误信息使用**中文**
- API 错误从 `response.error` 字段提取

### 新增页面模板

```tsx
'use client';

import { useState } from 'react';
import { Button, Input, Card, CardBody, Spinner } from '@/components/ui';
import { PageContainer, AuthGuard } from '@/components/layout';

export default function NewPage() {
  return (
    <AuthGuard>
      <PageContainer title="页面" titleAccent="标题">
        {/* 页面内容 */}
      </PageContainer>
    </AuthGuard>
  );
}
```

### 新增 UI 组件模板

新 UI 组件放入 `src/components/ui/`，并在 `index.ts` 中导出：

```tsx
'use client';

import { cn } from '@/lib/cn';

interface NewComponentProps {
  // ...
  className?: string;
}

export function NewComponent({ className, ...props }: NewComponentProps) {
  return (
    <div className={cn('base-classes', className)}>
      {/* ... */}
    </div>
  );
}
```

---

## API 集成

- API 请求通过 `src/lib/api-client.ts` 发送
- Next.js `rewrites` 将 `/api/*` 代理到后端 kratos-server
- 认证：JWT 存储在 `localStorage`，通过 cookie 同步
- 开发环境端口：前端 `30002`

---

## 构建与验证

- `npm run dev` — 启动开发服务器 (Turbopack)
- `npm run build` — 生产构建 + TypeScript 类型检查
- `npm run test` — 运行单元测试（vitest，单次）
- `npm run test:watch` — 监听模式
- `npm run verify:print` — **真实浏览器**验证打印导出的 PDF 文字层（见下）
- `npm run verify:ats` — 用**真实 PDF 字节**验证 ATS 体检报告（见下）
- `npm run verify:template` — **真实浏览器**验证模板渲染的分页与文字层（见下）
- 每次修改后应运行 `npm run build` 验证无类型错误；改动核心链路（解析、导出、渲染）时同时运行 `npm run test`

### 浏览器端验证（vitest 覆盖不到的部分）

`npm run verify:print` 驱动真实 Chromium 走一遍打印导出，再用 `extractPdfText` 断言真实产物字节。用于**只有浏览器才能验证**的事：打印样式、分页、PDF 文字层是否真的可抽取。

Chrome 没有以编程方式触发打印**对话框**的 API，所以这类验收只能这样验；脚本**退出码非 0 即失败**，可当门禁。

- 环境变量 `VERIFY_CHROMIUM=<path>`：复用已有的 Chromium，避免 Playwright 因版本固定而重新下载约 400 MB。
- 环境变量 `VERIFY_BASE_URL`：目标地址，默认 `http://localhost:30002`。
- 环境变量 `VERIFY_DEBUG=1`：打印分页测量明细。

`npm run verify:ats` 用 `src/lib/pdf-fixtures.ts` 生成的真实 PDF（有文字层 / 位图无文字层 / 含 U+FFFD）驱动 ATS 体检报告，断言 ADR-0005 的边界：**报告中不得存在任何形式的合成分数**（按字段名断言），每条风险可溯源到具名规则。同样以退出码为门禁。

`npm run verify:template` 渲染**真实的模板组件**（不是手写示例 HTML），在真实布局里测量，再用真实的分页代码打包并打印，断言页数、表头是否每页重复、章节标题有没有被孤立在页尾、PDF 文字层是否可抽取且无 `�`。

**它存在的理由值得记下来**：`verify:print` 用的是**手写**的示例 HTML，而手写 HTML 总是与代码的预期一致——所以它无法发现渲染器产出的形状变了。工单 20 正是这种情况：模板开始把章节包进一层 stack、把条目包进另一层，而分页把打印根的每个子元素当作不可分割的块，于是**整份简历静默变成一块**：一次分页、一页纸、布局看起来完全正常，全部既有测试通过。因此：

- 新增/修改模板后，`verify:print` 通过**不能**说明渲染路径没坏，必须跑 `verify:template`。
- 分页的单位是**条目**。渲染器里任何包住条目的容器都必须带 `data-print-flatten`，否则它会被当成一个不可分割的块。这条约束有测试钉住（`export-pdf.test.ts` 的 `flattenPrintFlow against the real print view`）。
- 条目之间的间距用 **CSS margin**（`.resume-entry + .resume-entry`）而不是 flex `gap`：分页逐个测量条目，而 `gap` 属于容器，不计入任何条目的高度，会让页面被塞入实际放不下的内容。

### Node 脚本导入应用模块

验证脚本要导入 `.ts` 源码（`node` 原生剥离类型），但**不解析 `@/*` 别名**。别名由 `scripts/alias-loader.mjs` 提供，**不要**为了脚本可运行而把源码里的 `@/` 导入改成相对路径：

```
node --import ./scripts/alias-loader.mjs scripts/xxx.mjs
```

`.tsx` 无法被 `node` 剥离（含 JSX），所以需要脚本驱动的逻辑要放在 `.ts` 模块里——例如 `ats-analyse.ts` 就是从 `AtsPreview.tsx` 里抽出来的。

### 测试约定

| 项 | 约定 |
|---|---|
| 位置 | **与被测文件同目录**（colocated），不用单独的 `__tests__/` 目录 |
| 命名 | `<被测文件名>.test.ts` / `.test.tsx` |
| runner | vitest（`vitest.config.mts`），`@/*` 别名原生解析，无需插件 |
| 环境 | 默认 `node`。只有真正需要 `document`/`window` 的测试才在文件首行加 `// @vitest-environment happy-dom` |
| 导入 | 从 `'vitest'` 显式导入 `describe` / `it` / `expect`（`globals: true` 仅为兼容从文档复制的用例） |
| 范围 | 只测**纯逻辑**（解析、序列化、PDF 文字层）。前端测试**不连后端**；后端行为由 `kratos-server` 的 Go 测试负责 |
| 目标 | **防回归**，不是覆盖率。优先覆盖：PDF 文字层、解析/回写幂等、日期与技能分隔符边界、YAML 特殊字符 |

**不要**为了凑覆盖率写无意义断言（`expect(true).toBe(true)`）。

### 记录已知缺陷

已确认存在、但尚未修复的缺陷，用 **`it.fails(...)`** 承载断言（注意 vitest 5 是复数 `fails`）：用例会运行、当前必须失败、套件保持绿色。这样缺陷**有可复现的证据**而不是只有一句描述，并且修复后该用例会自动变成失败，提醒把它改成普通 `it`。

例：`src/lib/resume-builder.test.ts` 中「no YAML escaping」分组，对应工单 17。

> `npm run test` 由 `.scratch/resume-platform/issues/01-frontend-test-infra.md` 引入（已完成）。

---

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature-slug>/` in this repo — not on GitHub. See `docs/agents/issue-tracker.md`.

当前活跃的 feature：**`.scratch/resume-platform/`** — 平台重构（44 个工单，含 `spec.md`）。

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

**这两个位置的内容现已存在，必须按其约定使用，不要再按"文件不存在则静默继续"处理：**

- [`CONTEXT.md`](./CONTEXT.md) — 领域词汇表。**在 issue、提案、测试名、提交信息中出现的领域概念必须使用其中的术语**，不要漂移到近义词（该文件末尾有「明确避免的用法」对照表）。
- [`docs/adr/`](./docs/adr/0000-index.md) — 架构决策记录。**动手前先读相关 ADR**；若某项工作与已有 ADR 冲突，**显式指出**，不要静默推翻。
