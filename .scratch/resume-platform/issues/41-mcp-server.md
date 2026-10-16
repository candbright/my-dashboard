# 41 — MCP server

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：18（结构化内容）、42（JSON 形态）
- **Blocks**：—
- **ADR**：—

## 背景

**MCP（Model Context Protocol）** 是让 LLM 客户端（Claude Desktop、Cursor 等）调用外部工具与数据的开放协议。

市场调研把它列为**新兴趋势**，并指出：

- Rezi 已上线 **Resume MCP**
- 超级简历提供 `npx clawcv` Skill 供 OpenClaw / Claude 使用
- Reactive Resume v6 提供 REST + MCP server

**对本项目的意义**：已经有现成的权限模型 + AI 网关 + Markdown/结构化存储，**接 MCP 的成本远低于从零做的团队**，且对开源项目是天然的差异化与话题点。

**一句话价值**：*"让 LLM 直接操作你的简历。"*

## 任务

### 1. MCP server 实现

- 独立进程或作为后端的一个入口
- 传输方式：**stdio**（本地使用，最简）与/或 **HTTP+SSE**
- 遵循 MCP 规范（tools / resources / prompts）

### 2. 暴露的能力（建议初始集）

| 类型 | 名称 | 作用 |
|---|---|---|
| resource | `resume://{slug}` | 以 Markdown 读取一份简历 |
| resource | `resume://{slug}/json` | 以 JSON Resume 读取（工单 42） |
| tool | `list_resumes` | 列出用户的简历 |
| tool | `read_resume` | 读取指定简历 |
| tool | `update_resume` | 更新简历内容（**走乐观锁与版本历史**） |
| tool | `analyze_resume` | 调用工单 31 的 AI 诊断 |
| tool | `match_jd` | 调用工单 32 的 JD 匹配 |
| tool | `export_resume` | 触发渲染（工单 23） |

### 3. 鉴权与权限（关键）

- **必须复用现有权限系统**（`permission_grants` + JWT）
- **写入操作必须走同样的乐观锁**（工单 12）——不要为 MCP 开捷径
- **写入必须产生版本历史**（工单 16）
- 游客账户 **只读**
- **管理员权限不得通过 MCP 提升**

⚠️ **MCP 是一个新的写入入口，安全面必须与 Web 界面同等对待。**

### 4. 输出的形态

- 简历内容以 **Markdown**（人类与 LLM 都友好）与 **JSON Resume**（结构化）两种形态提供
- 工具返回要**简洁**——LLM 的上下文有限，不要返回整份简历的冗余结构

## 验收标准

- [ ] MCP server 可被至少一个真实客户端连接（Claude Desktop / Cursor / MCP inspector）
- [ ] 资源与工具按上表可用
- [ ] **写入走乐观锁**，冲突返回明确错误
- [ ] **写入产生版本历史**
- [ ] 权限校验与 Web 界面一致
- [ ] 游客只读
- [ ] 无法通过 MCP 获得管理员权限
- [ ] 工具输出简洁（不返回整份文档的重复结构）
- [ ] 有文档说明如何配置客户端连接

## 备注

- 💡 **这是最便宜的开源噱头**：调研明确指出，具备 MCP 能力的简历产品极少，而本项目的架构（结构化内容 + 权限模型 + AI 网关）**天然适合**。
- ⚠️ 依赖工单 42 的 JSON 形态——MCP 的资源表示需要确定的结构。
- 不建议把 MCP 做成权限绕过通道。**所有写入路径的语义必须一致**。

## Comments

（待填）
