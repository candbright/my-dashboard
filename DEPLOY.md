# DEPLOY.md — 部署到 101.33.74.121（与 mc-dashboard / BDS 完全独立）

本文件记录 **my-dashboard (ResumeVault)** 在生产服务器上的部署方式。

- 公网入口：**https://candbright.top/my-dashboard**
- 服务器：`ubuntu@101.33.74.121`（Ubuntu 24.04.4 LTS，2 vCPU / 3.6 GiB）
- 部署目录：`~/my-dashboard-stack`
- 与原有 `mc-dashboard` 面板、`minecraft-bedrock` 服务 **完全独立**：独立容器、独立数据库、独立端口、独立 nginx location，不新增 systemd 单元，不改动任何原有配置（仅向 vhost 追加一行 `include`）。

---

## 1. 架构与数据流

```
浏览器
  └─ https://candbright.top/my-dashboard/...
        │
        ▼
   nginx :443  (/etc/nginx/sites-available/mc-dashboard)
        ├─ location /mc_dashboard/ , /api/ , /ws → 127.0.0.1:3001   ← 原 mc 面板（未改动）
        └─ location /my-dashboard                → 127.0.0.1:3002   ← 本次新增
                                                        │
                                                        ▼
                                              mydash-web (Next.js :30002)
                                                 │  Next.js rewrite
                                                 │  /my-dashboard/api/* → /api/*
                                                 ▼
                                            mydash-kratos :20002
                                                 ├─► mydash-postgres:5432
                                                 └─► mydash-redis:6379
```

容器（compose 项目 `mydash`，网络 `mydash-net`，全部 `restart: unless-stopped`）：

| 容器 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| `mydash-web` | `mydash-web:latest` | `127.0.0.1:3002 → 30002` | Next.js 生产服务 |
| `mydash-kratos` | `mydash-kratos:latest` | `127.0.0.1:20002 → 20002` | Go/Kratos 后端 |
| `mydash-postgres` | `postgres:16` | **不发布** | 数据库 `resumevault` |
| `mydash-redis` | `redis:7` | **不发布** | 缓存/验证码 |

> 3002 / 20002 只绑定 `127.0.0.1`，5432 / 6379 完全不发布端口 —— 外部无法直连，只能经 nginx。

---

## 2. 源码改动（basePath 支持）

Next.js 的 `basePath` 在 **构建期** 内联进客户端产物，因此必须支持按环境切换。共两处改动：

**`next.config.ts`** — 从环境变量读取 basePath（本地开发为空，行为不变）：

- `const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''`
- 条件注入 `basePath`
- rewrite：`source: ${basePath}/api/:path*` → `destination: ${API_URL}/api/:path*`，并显式 `basePath: false`
  （带 `basePath` 时 Next 会自动给 rewrite 的 source/destination 加前缀，而此处 destination 是外部绝对 URL，必须关闭自动加前缀）

**`src/lib/api-client.ts`** — `next/link`、`router.push` 会自动加 basePath，但裸 `fetch()` 和 `document.cookie` 不会：

- `apiFetch` 给以 `/` 开头的相对路径补上 basePath（已带前缀则不重复加）
- 写入 cookie 时 `path` 由 `/` 改为 basePath（**这是隔离的关键**，见下）

验证方式：`npm run build` 后检查 `routes-manifest.json`，应看到 `basePath: /my-dashboard` 与
`source: /my-dashboard/api/:path*`。

---

## 3. 隔离性保证

| 维度 | mc-dashboard（原有） | my-dashboard（本次） |
|------|---------------------|---------------------|
| 进程 | systemd `mc-dashboard.service` (node :3001) | Docker `mydash-*` |
| 数据库 | 原有实例 | 独立 `postgres:16` 容器 + 独立数据卷 |
| Redis | 原有实例 | 独立 `redis:7` 容器 |
| HTTP 路径 | `/mc_dashboard/`、`/api/`、`/ws` | `/my-dashboard/`、`/my-dashboard/api/` |
| 认证 cookie | `token` | `auth_token`，且 `Path=/my-dashboard` |
| 浏览器存储 | i18next 的 localStorage key | `auth_token`（键名不冲突） |
| 端口 | 3001 | 3002 / 20002（仅 loopback） |

站点根路径 `/api/*` 属于 mc 面板，因此本项目的 API 一律走 `/my-dashboard/api/*`，两者互不遮挡。

**cookie 作用域已实测**：登录后请求 mc 面板的 `/api/health`，请求头中 **完全不含 cookie**
（`auth_token` 因 `Path=/my-dashboard` 不会被发送），证明确实没有跨应用泄漏。

---

## 4. 目录对应关系

| 本地 | 服务器 |
|------|--------|
| `deploy/`（本目录，源码） | `~/my-dashboard-stack/` |
| `deploy/kratos/kratos-server`（构建产物，未入库） | `~/my-dashboard-stack/kratos/kratos-server` |
| 应用源码（`src/`、`package.json` 等） | `~/my-dashboard-stack/src/my-dashboard/` |

`~/my-dashboard-stack/runtime/` 为服务器本地生成，**不入库**：`.env`（0600）、`kratos/conf/config.yaml`（0640）、
`postgres-data/`、`resumes/`。

---

## 5. 首次部署（可复现）

在 **本地** 准备两份产物：

**1) 交叉编译 kratos-server**（源码仓库 `kratos-server`，Windows → linux/amd64）：

```powershell
cd D:\project-me\kratos-server
$env:CGO_ENABLED='0'; $env:GOOS='linux'; $env:GOARCH='amd64'
go build -ldflags "-X main.Version=deploy-$(Get-Date -Format yyyyMMddHHmm)" `
         -o bin\kratos-server-linux-amd64 .\cmd\kratos-server
```

放置为 `deploy/kratos/kratos-server`。

**2) 打包应用源码**（排除 `node_modules` / `.next` / `.env.local` / `.git`）：

```powershell
tar czf mydash-src.tar.gz --exclude=node_modules --exclude=.next --exclude=.git `
    --exclude='.env*' -C D:\project-me\my-dashboard .
```

**3) 上传并部署**：

```bash
scp deploy/* ubuntu@101.33.74.121:~/my-dashboard-stack/       # 叠加 Dockerfile / compose / 脚本
scp deploy/kratos/kratos-server ubuntu@101.33.74.121:~/my-dashboard-stack/kratos/
ssh ubuntu@101.33.74.121
cd ~/my-dashboard-stack
bash deploy.sh          # 生成密钥 → 构建镜像 → 启动 → 健康检查
bash setup-nginx.sh     # 安装 nginx 片段并 reload（失败自动回滚）
bash verify.sh          # 20 项验收
```

本次部署使用的后端版本：`kratos-server` @ `f3c5117aafb9`（工作区干净），
`main.Version=deploy-202610091545`。

---

## 6. 日常运维

```bash
cd ~/my-dashboard-stack

docker compose ps                      # 状态
docker compose logs -f web             # Web 日志
docker compose logs -f kratos          # 后端日志
docker compose restart web             # 重启单个服务
bash verify.sh                         # 全量验收

# 只更新前端（改了 src/ 之后）
# 先在本地重新打包源码并解压覆盖 ~/my-dashboard-stack/src/my-dashboard/，然后：
bash deploy.sh                         # 幂等，可重复执行

# 数据库
source .env
docker exec -it mydash-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

`bootstrap-env.sh` **永不覆盖已存在的 `.env`**（轮换 postgres 密码会让数据库读不出自己的数据）；
kratos 配置由 `.env` 重新渲染，可安全重复执行。

---

## 7. 密钥与账号

| 项目 | 位置 / 值 |
|------|-----------|
| `.env`（postgres 密码、JWT 密钥、管理员密码） | `~/my-dashboard-stack/.env`，0600，仅 ubuntu 可读 |
| kratos 配置 | `~/my-dashboard-stack/runtime/kratos/conf/config.yaml`，0640 `ubuntu:10001` |
| 管理员 | `candbright` / `669b970b0fc32a70`（邮箱 `candbright@outlook.com`） |
| 游客 | `guest@example.com` / `guest@123`（登录页「游客登录」按钮） |
| 数据库 | `resumevault` / 用户 `myadmin` / 密码见 `.env` |

> 登录后请尽快修改管理员密码。`JWT_SECRET` 与 postgres 密码为部署时随机生成，未写入任何仓库。

---

## 8. 回滚

**只回滚 nginx（保留应用）**

```bash
sudo cp /etc/nginx/sites-available/mc-dashboard.bak-20261009-155629 \
        /etc/nginx/sites-available/mc-dashboard
sudo nginx -t && sudo systemctl reload nginx
```

**停掉整个应用**（mc 面板与 BDS 不受影响）

```bash
cd ~/my-dashboard-stack && docker compose down
```

**彻底清除（含数据）**

数据用的是 bind mount（`runtime/postgres-data`、`runtime/resumes`），不涉及具名卷：

```bash
cd ~/my-dashboard-stack && docker compose down
sudo rm -rf ~/my-dashboard-stack                # 连同数据库与上传的简历一起删除
docker image rm mydash-web:latest mydash-kratos:latest
```

---

## 9. 已验证项

`bash verify.sh` → **20 passed, 0 failed**，覆盖：

- `/my-dashboard`、`/my-dashboard/login` → 200；HTML 引用 `/my-dashboard/_next/` 资源
- `POST /my-dashboard/api/auth/guest-login` → 200 且返回 JWT（证明 nginx → Next → kratos 全链路可用）
- mc 面板 `/api/health` 仍为原响应、`/api/resumes` 为 404（未被本项目接管）
- `/mc_dashboard/` → 200，`mc-dashboard` / `minecraft-bedrock` / `nginx` systemd 均 active
- 4 个容器 running，3002 仅绑定 loopback，5432/6379/3002/20002 未对外暴露
- postgres 已迁移 4 张表（`users`、`resumes`、`system_config`、`verification_codes`）

另有真实浏览器验证：首页正常渲染（无 console 报错）、游客登录成功跳转、`/my-dashboard/api/auth/me`
带 token 返回 200、站点根 `/api/health` 仍由 mc 面板响应且**不携带**本项目的 cookie。

资源占用：整个技术栈约 205 MiB（web 109 + postgres 71 + redis 16 + kratos 8），
服务器可用内存 2.6 GiB，BDS 进程（427 MiB）与面板运行正常。

---

## 10. 注意事项

- **URL 规范**：Next.js 以 `https://candbright.top/my-dashboard`（**不带**尾斜杠）为标准形式；
  带尾斜杠的 `/my-dashboard/` 会返回 308 跳转过去。nginx 片段特意使用**不带**尾斜杠的
  `location /my-dashboard` 前缀匹配，避免与 Next.js 的 308 形成重定向循环。
- 证书为 `candbright.top` 现有 certbot 证书，`/my-dashboard` 与 mc 面板共用，无需新证书。
- 上传体积上限 50 MB（`client_max_body_size`），SSE 流式接口已关闭 nginx 缓冲。
- `.env` 一旦丢失，postgres 密码无法恢复，需重建数据库；请做好备份。
