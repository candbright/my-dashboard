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
- 每次修改后应运行 `npm run build` 验证无类型错误
