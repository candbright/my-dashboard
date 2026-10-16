# 36 — 访问统计

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：11（迁移器）
- **Blocks**：—
- **ADR**：—

## 背景

市场调研反复出现同一个发现：

> **分享页分析（浏览量/下载量）是最高杠杆的付费点**——VisualCV、Standard Resume、Resume.io **都在用它变现**。

国内产品中，超级简历有"谁看过我的简历"。

而调研同时指出：**"在线简历 vs 附件简历"的困惑无人解决**——访问统计正好能让用户看到"我的**在线简历**被看了几次"，从而理解两种产物的区别。

## 任务

### 1. 数据表

```sql
CREATE TABLE resume_views (
  id          bigserial PRIMARY KEY,
  resume_id   uuid NOT NULL,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  referrer    varchar(512),
  country     varchar(8),
  device_type varchar(16),   -- 'desktop' | 'mobile' | 'tablet'
  is_bot      boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_resume_views_resume_time ON resume_views (resume_id, viewed_at DESC);
```

走工单 11 的迁移器。

### 2. 隐私边界（必须明确）

⚠️ **不要做"谁看了我的简历"这种可识别个人的功能。**

- **不记录 IP 原文**（若要区分独立访客，用**每日轮换的哈希**，且不落库原文）
- **不记录 User-Agent 原文**（只提取设备类型）
- **不做反查身份**
- 在产品文案中明确说明采集了什么

**理由**：简历访问者可能是 HR、猎头、或竞争对手。把"谁看过你"做成产品功能，本质是在泄露第三方行为——**这在隐私合规上是明确的红线**，且与"自托管、尊重用户"的定位冲突。

### 3. Bot 过滤

- 在写入前过滤明显爬虫（User-Agent 特征）
- **同时记录 `is_bot`**，便于事后调整规则
- 自访问不计入（owner 看自己的简历）

### 4. 展示

- 总浏览量、独立访客（去重估算）
- **时间趋势**（近 7 / 30 天）
- 来源分布（如有 referrer）
- 下载量（附件简历被下载/投递次数）

### 5. 与"两种产物"的配合

分成两组数字：
- **在线简历**：被查看了几次
- **附件简历**：被生成/下载/投递了几次

**这组对比本身就是最好的产品教育。**

## 验收标准

- [ ] 公开页访问被记录
- [ ] **不存储 IP 与 UA 原文**
- [ ] owner 自访问不计入
- [ ] 爬虫被过滤且记录 `is_bot`
- [ ] 展示总量、独立访客、趋势、来源
- [ ] 在线简历与附件简历的数字**分开呈现**
- [ ] 隐私采集范围在产品中明确说明
- [ ] 有测试覆盖 bot 过滤与自访问排除
- [ ] 大量访问时写入不显著拖慢页面（考虑异步）

## 备注

- ⚠️ **破解"在线 vs 附件"的困惑是本工单的隐藏价值**——比访问统计本身更有用。
- 表会快速增长（每次访问一行）。**建议规划聚合/归档策略**，但不要现在实现。
- 公开页当前是 `dynamic = 'force-dynamic'` 的 SSR（`src/app/resume/[slug]/page.tsx`），记录点可以放在服务端。

## Comments

（待填）
