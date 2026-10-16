# 33 — AI 用量记帐表

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：11（迁移器）
- **Blocks**：—
- **ADR**：—

## 背景

后端**没有任何配额、用量计数或 token 记账**。现有的只有：

- 验证码 60 秒重发节流
- `max_tokens` 参数
- 分页 `limit`

每用户 AI 状态**只是权限授予**（`ai:use_global`）+ 遗留的 `users.ai_enabled`。

**没有配额本身是正确决定（Q30=B）：定位是自托管工具，不阻断调用。** 但**没有可观测性是不可接受的**——AI 调用是**真金白银**，自托管管理员最需要知道的恰恰是"这个月 API 花了多少"。

## 任务

### 1. 用量表

```sql
CREATE TABLE ai_usage (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  capability   varchar(32) NOT NULL,   -- 'parse' | 'chat' | 'analyze' | 'match'
  provider_id  varchar(64),
  model        varchar(128),
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  duration_ms  integer,
  success      boolean NOT NULL DEFAULT true,
  error_code   varchar(64),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_user_created ON ai_usage (user_id, created_at DESC);
CREATE INDEX idx_ai_usage_capability   ON ai_usage (capability, created_at DESC);
```

走工单 11 的迁移器（`AutoMigrate` 无法可靠处理索引）。

### 2. 记录点

在 AI 网关的**统一出口**记录——**所有协议（`openai-completions` / `openai-responses` / `anthropic-messages`）共用一处**，不要在三个地方各写一遍。

- `parse` / `chat` / `analyze` / `match` 全部记录
- **失败也要记录**（含 `error_code`）——失败同样可能消耗 token
- **记录 token 用量**：从 provider 响应的 `usage` 字段读取；若 provider 不返回，则估算并标注为估算值

### 3. 管理端展示

- **总量**：本月调用次数、token 总数
- **按用户**：谁用了多少
- **按能力**：哪个能力最贵
- **异常检测**：单用户单日调用次数异常（如 > 500 次）时高亮

### 4. 明确不做（Q30 决策）

- ❌ **不做配额阻断**（不按天/按月限制）
- ❌ **不做计费**
- ❌ **不做升级引导**

> 若将来要加阻断，**数据已经在了**——这是先做记账不做阻断的额外收益。

### 5. 注意

⚠️ **100% 的写入会显著增加数据库写入量**（每次 AI 调用一条）。考虑：
- 异步写入（不阻塞 AI 响应）
- 或批量写入
- **不要因为记账拖慢用户感知的响应速度**

## 验收标准

- [ ] 四种能力（parse/chat/analyze/match）的调用都被记录
- [ ] 失败调用也被记录
- [ ] 记录点**只有一处**（AI 网关统一出口）
- [ ] 管理端可查看总量、按用户、按能力
- [ ] token 用量从 provider 响应读取，估算值有明确标注
- [ ] **记账不阻塞 AI 响应**（异步或批量）
- [ ] 游客账户的调用（若有）也被记录
- [ ] 无阻断逻辑（确认没有任何地方因用量拒绝请求）
- [ ] 后端测试覆盖记录逻辑

## 备注

- ⚠️ 前端需要相应调整：现有 `AISectionChat` / `AIUpload` 读取 SSE 流；若在流结束时追加一个 usage 事件，前端要能忽略或展示它。
- 表会随时间增长——**建议同时记录保留策略**（如保留 12 个月），但**不要现在实现自动清理**（数据比空间宝贵）。

## Comments

（待填）
