# ResumeVault

个人简历管理平台 — 上传、编辑、AI 解析、在线展示，一站式管理你的职业名片。

![Design](https://img.shields.io/badge/design-Natural%20Organic-5c4033?style=flat)
![Framework](https://img.shields.io/badge/framework-Next.js%2016-000?style=flat&logo=next.js)
![Styling](https://img.shields.io/badge/styling-Tailwind%20CSS%20v4-38bdf8?style=flat&logo=tailwindcss)

---

## 界面设计

采用 **StyleKit 自然有机风 (Natural Organic)** — 灵感源自大地色系与有机形态，温润克制，不刺眼、不冰冷。

- 石棕 + 鼠尾草绿主色调，暖奶油底色
- Noto Serif SC 宋体标题，圆润的药丸形交互
- 500ms 慢节奏自然过渡动画
- 零重阴影、零冷色调、零渐变背景

> 设计规范详见 [`AGENTS.md`](./AGENTS.md)

---

## 核心功能

### 📄 简历管理
- **Markdown 编写** — 纯文本驱动，结构化 YAML frontmatter + Markdown 正文
- **模板市场** — 程序员 / 法律 / 财务等多行业预设模板，一键套用
- **在线编辑** — 拖拽排序模块、行内编辑、AI 辅助润色
- **实时预览** — 分栏所见即所得，左侧编辑右侧同步渲染

### 🤖 AI 智能解析
- 上传 PDF / Word / 纯文本，AI 自动提取并转为结构化简历
- 多轮对话优化 — 告诉 AI 你想怎么改，边聊边调整
- 版本历史 — 每次对话修改均可回退
- 支持 DeepSeek / OpenAI / 通义千问 / 智谱 / Moonshot / 自定义 API

### 🔗 在线展示
- 每份简历生成独立展示页 `resume/[slug]`
- 滚动关联动画、技能标签云、时间线布局
- 支持隐藏/公开切换

### 👥 用户体系
- 注册 / 登录 / 密码修改 / 邮箱绑定
- 管理员后台：用户管理、简历审核、AI 全局配置

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, framer-motion |
| 图标 | lucide-react |
| 字体 | Noto Serif SC (Google Fonts) |
| 工具 | clsx + tailwind-merge |

---

## 页面一览

| 路由 | 功能 |
|------|------|
| `/` | 仪表盘 — 简历概览与快捷入口 |
| `/upload` | 创建简历 — 上传 / 模板 / 空白 三选一 |
| `/my` | 我的简历 — 列表管理与操作 |
| `/resume/[slug]` | 简历展示页 — 公开在线简历 |
| `/login` / `/register` | 登录 / 注册 |
| `/settings` | 账号设置 — 用户名、邮箱、密码 |
| `/settings/ai` | AI 配置 — 自定义 API Key |
| `/admin` | 管理后台 — 审核、用户管理、全局配置 |

---

## 快速开始

```bash
npm install
npm run dev        # http://localhost:30002
npm run build      # 生产构建 + 类型检查
```
