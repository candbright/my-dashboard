# 37 — SEO：sitemap / robots / OG image / JSON-LD

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：—
- **Blocks**：—
- **ADR**：—

## 背景

公开简历页（`/resume/[slug]`）**完全没有 SEO 基建**：

- ❌ 无 `sitemap.ts`
- ❌ 无 `robots.ts`
- ❌ 无 `manifest`
- ❌ 无 OG image
- ❌ 无结构化数据（JSON-LD）

而**在线简历的核心价值就是被找到**。没有 SEO，公开页只是一个"知道链接才能访问"的页面。

`page.tsx` 已有 `generateMetadata`，是现成的挂载点。

## 任务

### 1. `sitemap.ts`

- 列出所有**公开且已审核通过**的简历页
- 依据：`visibility='public' AND approval_status='approved'`（与 `ListPublicApproved` 同源）
- ⚠️ **必须尊重"不索引"开关**（工单 38）——被标记为不索引的简历不得进入 sitemap

### 2. `robots.ts`

- 允许索引公开简历页
- 禁止索引 `/admin`、`/my`、`/settings`、`/api/*`
- 指向 sitemap

### 3. OG image

- 每份简历的动态 OG 图（姓名、职位、几个关键词）
- 遵守 Natural Organic 规范（暖奶油底、石棕文字、无冷色）
- ⚠️ **用 Next 16 的 `ImageResponse`**（`next/og`）——**写代码前读 `node_modules/next/dist/docs/`，这个版本的 API 与训练数据可能不同**

### 4. JSON-LD

```jsonc
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "...",
  "jobTitle": "...",
  "knowsAbout": ["React", "TypeScript"],
  "url": "..."
}
```

- **只放用户已公开的信息**
- 不要在结构化数据中暴露邮箱/电话（除非用户明确选择公开）

### 5. `manifest`

- 基本的 PWA manifest（名称、图标、主题色 `#5c4033`）

### 6. 其他

- `metadataBase` 配置（避免 OG 图 URL 出错）
- 中文简历页的 `lang="zh-CN"`
- 公开页的 canonical URL

## 验收标准

- [ ] `/sitemap.xml` 可访问，含公开简历页，**不含未审核/私有/不索引的**
- [ ] `/robots.txt` 可访问，规则正确
- [ ] 公开简历页有正确的 OG 标签，分享到社交平台有预览图
- [ ] OG 图**视觉符合设计规范**
- [ ] 有 JSON-LD 且**不含未公开的联系方式**
- [ ] `manifest` 存在
- [ ] `metadataBase` 已配置
- [ ] `npm run build` 通过
- [ ] **已阅读 `node_modules/next/dist/docs/` 中与 metadata / ImageResponse 相关的文档**

## 备注

- ⚠️ **必须先读 Next 16 的文档**——`AGENTS.md` 明确警告"This is NOT the Next.js you know"，metadata API 与 `ImageResponse` 在这个版本可能不同。
- ⚠️ **sitemap 与 robots 必须与工单 38 的"不索引"开关联动**——否则用户关闭索引后仍被搜索引擎收录，是严重的产品承诺违背。
- `next.config.ts` 已有 `images.remotePatterns`（三个域）——OG 图若用远程头像会受影响。

## Comments

（待填）
