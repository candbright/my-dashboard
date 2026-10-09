# my-dashboard 生产部署（独立于 mc-dashboard / BDS）

`https://candbright.top/my-dashboard/` 的服务栈，与同机上的 mc 面板（`/mc_dashboard/` + `/api/`，
systemd `mc-dashboard.service` :3001）和 BDS（`minecraft-bedrock.service`）**完全独立**。

## 架构

```
Internet → nginx (443, candbright.top)
             ├── /mc_dashboard/, /api/, /ws  → 127.0.0.1:3001   (mc 面板，原有，未改动)
             └── /my-dashboard/              → 127.0.0.1:3002   (本栈 mydash-web)
                                                        ↓ Next.js rewrite /my-dashboard/api/*
                                                    mydash-kratos:20002
                                                        ↓ mydash-net
                                                    mydash-postgres:5432
                                                    mydash-redis:6379
```

隔离手段：

| 项 | 本栈 | 与 mc 的关系 |
|----|------|-------------|
| systemd | 无（纯 Docker，`restart: unless-stopped`） | 不碰 `mc-dashboard.service` / `minecraft-bedrock.service` |
| 容器名 | `mydash-*` | mc 面板跑在宿主机，非容器 |
| Docker 网络 | `mydash-net`（独立 bridge） | 不加入任何已有网络 |
| 宿主机端口 | 仅 `127.0.0.1:3002`、`127.0.0.1:20002`（都只绑回环） | 3001/80/443 不受影响 |
| 数据库/缓存 | 容器内，**不发布任何端口** | 无 |
| HTTP 路径 | `/my-dashboard/`、`/my-dashboard/api/*` | mc 占用根级 `/api/*`，两者不可能冲突 |
| nginx | `/etc/nginx/snippets/my-dashboard.conf` 一个 include | 只往 candbright.top 的 server 块加一行 include |

> ⚠️ `NEXT_PUBLIC_BASE_PATH=/my-dashboard` 是**构建期内联**的，改路径必须重新 build 镜像。

## 目录

```
/home/ubuntu/my-dashboard-stack/
├── .env                      # 密钥（0600，首次生成后不再变动）
├── docker-compose.yml
├── Dockerfile.kratos         # alpine:3.20 + 预编译静态二进制
├── Dockerfile.web            # node:20-alpine + npm ci + next build
├── bootstrap-env.sh          # 生成 .env 与 runtime/kratos/conf/config.yaml
├── deploy.sh                 # 构建镜像 + 启动 + 健康检查
├── setup-nginx.sh            # 安装 snippet 并 include 进 candbright.top
├── verify.sh                 # 验收自测
├── nginx-my-dashboard.conf   # nginx snippet
├── kratos/kratos-server      # linux/amd64 二进制（本地交叉编译）
├── src/my-dashboard/         # 前端源码（构建上下文）
└── runtime/
    ├── postgres-data/        # 数据库数据（容器卷）
    ├── resumes/              # 简历文件（uid 10001）
    └── kratos/conf/config.yaml  # kratos 配置（0600，由 .env 生成）
```

## 日常操作

```bash
cd ~/my-dashboard-stack

# 更新前端代码后重新部署（重跑构建 + 重启）
bash deploy.sh

# 只重启
docker compose --env-file .env restart web
docker compose --env-file .env restart kratos

# 日志
docker logs -f mydash-web
docker logs -f mydash-kratos

# 状态 / 验收
docker compose --env-file .env ps
bash verify.sh

# 凭据（数据库口令、JWT、管理员密码）
sudo cat runtime/kratos/conf/config.yaml      # admin.password 即后台管理员密码
sudo cat .env
```

## 回滚

1. **只回滚 nginx 路由**（新应用下线，mc 完全不受影响）：

   ```bash
   sudo cp -a /etc/nginx/sites-available/mc-dashboard.bak-<时间戳> \
              /etc/nginx/sites-available/mc-dashboard
   sudo nginx -t && sudo systemctl reload nginx
   ```

2. **停掉整个栈**（不删数据）：

   ```bash
   cd ~/my-dashboard-stack
   docker compose --env-file .env down
   ```

3. **连数据一起删除**：

   ```bash
   docker compose --env-file .env down
   sudo rm -rf runtime/postgres-data runtime/resumes
   ```

4. **回退前端版本**：本地切到上一个良好 commit → 重新打源码包 → 覆盖
   `src/my-dashboard/` → `bash deploy.sh`（`NEXT_PUBLIC_BASE_PATH` 已在 Dockerfile 内固定）。

## 重建 kratos 二进制

后端是本地交叉编译后上传的（服务器上不装 Go）：

```pwsh
cd <本地 kratos-server>
$env:CGO_ENABLED='0'; $env:GOOS='linux'; $env:GOARCH='amd64'
go build -o bin/kratos-server-linux-amd64 ./cmd/kratos-server/
# 上传到 ~/my-dashboard-stack/kratos/kratos-server 后重跑 deploy.sh
```
