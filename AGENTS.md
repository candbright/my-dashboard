<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — my-dashboard

## Project Overview

**my-dashboard** 是一个基于 Next.js 的 ResumeVault 前端项目，采用 **HeroUI 设计风格**，实现简历管理、上传、AI 解析、用户认证、管理员后台等功能。

- **Framework**: Next.js 16.2.6 (App Router, Turbopack)
- **React**: 19.2.4
- **CSS**: Tailwind CSS v4 (`@tailwindcss/postcss`)
- **Animation**: framer-motion 12.39.0
- **Icons**: lucide-react
- **Utility**: clsx + tailwind-merge (via `cn()`)

---

## UI 设计规范 — HeroUI Design Language

本项目采用 **HeroUI (heroui.pro)** 的设计语言，但**不依赖 `@heroui/react` 包**，而是自建了一套轻量级的 HeroUI 风格组件系统。所有 UI 开发必须遵循以下规范。

### 色彩体系 (Design Tokens)

所有颜色通过 CSS 变量定义在 `src/app/globals.css`，并通过 `@theme inline` 注册为 Tailwind 颜色类。

| 语义 | Light 值 | Dark 值 | Tailwind 类 |
|------|---------|---------|------------|
| **Primary** | `#006FEE` | `#338ef7` | `bg-primary`, `text-primary`, `border-primary` |
| **Secondary** | `#7828c8` | `#9353d3` | `bg-secondary`, `text-secondary` |
| **Success** | `#17c964` | `#45d483` | `bg-success`, `text-success` |
| **Warning** | `#f5a524` | `#f7b750` | `bg-warning`, `text-warning` |
| **Danger** | `#f31260` | `#f54180` | `bg-danger`, `text-danger` |
| **Background** | `#ffffff` | `#000000` | `bg-background` |
| **Foreground** | `#11181c` | `#ecedee` | `text-foreground` |

**表面层级 (Content Surfaces):**
- `content1` — 卡片/容器背景 (`bg-content1`)
- `content2` — 次级表面 (`bg-content2`)
- `content3` — 第三级表面 (`bg-content3`)

**中性色阶 (default-50 ~ default-900):**
- 用于边框 (`border-default-200`)、辅助文字 (`text-default-500`)、悬停背景 (`bg-default-100`) 等
- Dark 模式下数值自动反转 (50↔900, 100↔800...)

**渐变:**
- `--gradient-start` / `--gradient-end` — 从 primary 到 secondary
- 使用 `.gradient-text` 类实现渐变文字效果

### ⚠️ CSS 变量对照表 (迁移映射)

如果遇到旧的 shadcn/自定义变量，按以下规则替换：

| 旧变量 / 类名 | 新变量 / 类名 |
|--------------|--------------|
| `var(--border)` | `var(--default-200)` / `border-default-200` |
| `var(--muted-foreground)` | `var(--default-500)` / `text-default-500` |
| `var(--muted)` | `var(--default-100)` / `bg-default-100` |
| `var(--card)` | `var(--content1)` / `bg-content1` |
| `var(--accent)` | `var(--primary)` / `text-primary` |
| `var(--accent-glow)` | `primary/10` or `primary/5` |
| `#6366f1` (旧 indigo) | `#006FEE` (HeroUI primary) |
| `var(--gradient-start)` | `from-primary` |
| `var(--gradient-end)` | `to-secondary` |

---

## 组件架构

### 目录结构

```
src/
  components/
    ui/              ← UI 原子组件 (HeroUI 风格)
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
4. **间距与圆角**：遵循 Tailwind 默认比例 (`rounded-xl`, `rounded-2xl`, `p-4`, `gap-3` 等)
5. **阴影**：使用 `shadow-sm`, `shadow-md`, `shadow-lg` 或自定义 `glow-primary`
6. **玻璃效果**：使用 `.glass` 工具类
7. **渐变文字**：使用 `.gradient-text` 工具类

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
