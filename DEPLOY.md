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

> [!IMPORTANT]
> **数据库迁移没有自动回滚，回滚靠备份恢复。**
>
> 自 ADR-0006 起，kratos-server 启动时按序执行**编译进二进制**的版本化迁移，并把执行记录写入 `schema_migrations` 表（`version` / `name` / `applied_at` / `checksum`）。这是有意设计：
>
> - **迁移失败 → 拒绝启动。** 与服务既有风格一致（`AI_KEY_ENCRYPTION_SECRET` 未设置本来就 panic，Postgres 不可达本来就起不来）。半迁移的库配上能写入的服务会持续产生错误数据，比不启动危险得多。
> - **没有逆向迁移脚本。** 在数据迁移上，回滚往往比不回滚更危险（可能丢数据，且回滚脚本本身无法保证正确）。改错了只能从备份恢复。
> - **已应用的迁移不可修改。** 迁移的 `checksum` 覆盖版本号、名称、执行模式与 SQL 摘要；启动时比对不一致即**拒绝启动**。修正必须**新增一条迁移**，不能改旧的那条。
>
> **因此：执行任何会改 schema 的发布之前，先落一份全库快照。**
>
> ```bash
> # 在部署机上（DB 容器内）
> docker exec mydash-postgres pg_dump -U postgres resume_vault \
>   | gzip > ~/backup/resume_vault-$(date +%Y%m%d-%H%M%S).sql.gz
> ```
>
> 恢复时先 `docker compose down` 停应用，再 `gunzip -c <备份> | docker exec -i mydash-postgres psql -U postgres resume_vault`，最后起服务。
>
> **查看当前库在哪一版：**
>
> ```bash
> docker exec mydash-postgres psql -U postgres resume_vault \
>   -c 'SELECT version, name, applied_at FROM schema_migrations ORDER BY version;'
> ```
>
> 版本 0 是 `baseline_automigrate`——迁移器引入之前由 GORM `AutoMigrate` 建出的基线 schema。真正的迁移从 1 开始。
>
> **从"每次启动都 AutoMigrate"切到版本化迁移时的说明：** 存量库第一次用新二进制启动时，`schema_migrations` 为空。迁移器会先跑一次 `AutoMigrate`（对已经存在的表是幂等的无操作），然后把基线记为版本 0。这一步假设磁盘上的表结构就是当前这个构建的模型所描述的样子；如果不然，删除 `version = 0` 那一行即可让它重新走一遍。

**只回滚 nginx（保留应用）**

```bash
sudo cp /etc/nginx/sites-available/mc-dashboard.bak-20261009-155629 \
        /etc/nginx/sites-available/mc-dashboard
sudo nginx -t && sudo systemctl reload nginx
```

**回滚应用镜像（不动数据库）**

镜像可以直接回退到上一版；只要上一版**不早于**当前库的 `schema_migrations` 版本，就能正常启动。反之会在启动时明确报错并拒绝启动——这正是迁移器的设计目的，而不是意外。

**停掉整个应用**（mc 面板与 BDS 不受影响）

```bash
cd ~/my-dashboard-stack && docker compose down
```

---

## 8.1 破坏性 API 变更：`PUT /api/resumes/{id}` 现在要求版本号

> **这一节有明确的结束条件，见文末「过渡期何时结束」。**

ADR-0010 给简历加了乐观锁。`PUT /api/resumes/{id}` 现在要求请求体带上 `version`——客户端最后一次读到的版本号，从 `GET /api/resumes/{id}`、`GET /api/resumes` 或上一次 `PUT` 的响应的 `resume.version` 里取。

**不带版本号的请求会被拒绝，不会静默写入。**

| 情况 | 状态码 | `reason` |
|---|---|---|
| `version` 与服务端一致 | 200 | — |
| `version` 不一致（别人先保存了） | 409 | `VERSION_MISMATCH` |
| `version` 缺失或为 0 | 409 | `VERSION_MISSING` |

409 的响应体（`error` 是给人看的，`metadata` 是给程序看的）：

```json
{
  "error": "这份简历已在别处被修改（服务端版本 3，最后修改于 2026-10-13 10:56:19）。请刷新后重试，以免覆盖他人的改动。",
  "reason": "VERSION_MISMATCH",
  "metadata": {
    "resume_id": "d0b07541-...",
    "current_version": "3",
    "expected_version": "1",
    "last_modified_at": "2026-10-13T10:56:19+08:00"
  }
}
```

`metadata` 的值都是**字符串**。`reason` 与 `metadata` 以前被错误编码器丢掉，本工单一起修好了；`error` 字段的含义没有变，现有读取 `response.error` 的调用方不受影响。

### 为什么不是"暂时允许不带版本号"

proto3 的普通标量字段**无法区分"字段缺失"和"值为 0"**。所以服务端没有办法只对旧客户端放行：任何"允许 0"的写法都会让锁失效，而绕过它的方式仅仅是**不发这个字段**。

这一点在实现过程中真的发生过一次——`WHERE` 子句被写成 `if expectedVersion > 0` 才拼接，结果一个不带版本号的请求返回了 200 并写入了数据。实机验证时抓到的，已修复并加了回归测试（`TestMissingVersionIsRefused`、`TestConcurrentTabsProduceAConflictNotASilentOverwrite`）。

因此过渡期的策略是：**旧客户端得到明确的、可处理的 409，而不是一个静默覆盖窗口。**

### 部署顺序（必须先后端后前端）

1. **先部署后端。** 启动时会自动执行 `schema_migrations` 里版本 1 的迁移（加 `resumes.version` 列 → 回填存量行 → 加 `NOT NULL`），并记录在 `schema_migrations` 表里。
   - 迁移对**已有数据的表**是安全的：先加可空列，再回填，最后加约束。`AutoMigrate` 做不到这件事（它会在非空表上直接失败）。
   - 启动日志会打印 `migration: applied 1 migration(s); schema version now 1`。
2. **再部署前端。** 新版前端会读取并回传 `version`。

部署新版后端之后、旧版前端仍然在跑的那段时间里，**保存会返回 409 且不写入**。这不是数据损坏，但它意味着编辑动作会失败，所以两步之间的间隔应尽量短。查询列表和公开简历页不受影响（只读）。

### 过渡期何时结束

过渡期在满足**全部**下列条件时结束，此后本节可以删除：

1. 后端已部署且 `SELECT version FROM schema_migrations ORDER BY version;` 的最大值为 **1 或更高**；
2. 前端已部署到读回 `version` 的版本（即 `src/lib/resume-api.ts` 存在）；
3. 后端访问日志连续 **7 天**没有出现 `reason=VERSION_MISSING`。

第 3 条是真正的判据：它直接说明已经没有任何客户端在不带版本号地保存了。日志格式见 `internal/server/http.go` 的 `[HTTP] PUT /api/resumes/... → 409: ... (reason=VERSION_MISSING)`。

在那之前**不要**放宽服务端的校验。

---

## 8.2 彻底清除（含数据）

数据用的是 bind mount（`runtime/postgres-data`、`runtime/resumes`），不涉及具名卷：

```bash
cd ~/my-dashboard-stack && docker compose down
sudo rm -rf ~/my-dashboard-stack                # 连同数据库与上传的简历一起删除
docker image rm mydash-web:latest mydash-kratos:latest
```

---

## 8.3 元数据迁入数据库列（工单 17 / ADR-0003）

> **这是破坏性数据迁移。执行前必须同时备份数据库与简历文件——只备份数据库是不够的。**

### 这次迁移改了什么

在此之前，简历元数据（姓名、职位、邮箱……）**同时**存在于两个地方：`{uuid}.md` 文件头部的
frontmatter，以及 `resumes` 表的对应列。两处由**两套不同的解析器**各自解释——前端用完整
YAML，后端用手写的 `key: value` 逐行扫描——所以同一个文件两端可能读出不同结果。已经发生过的
缺陷：前端拼接 frontmatter 时不加引号，值里带 `:` 或 `#` 就会产出非法 YAML，简历回读失败。

ADR-0003 的结论是**消除第二份权威**，而不是修好那个拼接：

- `resumes` 的列成为元数据的**唯一**权威；
- 存储的简历文档**不含 frontmatter**，只含正文；
- frontmatter 降级为**交换格式**，只出现在导入与导出两个边界上。

因此迁移条目 `version = 2`（`backfill_resume_metadata_from_documents`）做三件事：

1. 用**真正的 YAML 解析器**读取每个 `{uuid}.md` 的 frontmatter，写入**空着的**列（已有值的列不动）；
2. 把剥离 frontmatter 后的正文写到**新文件** `{uuid}.body.md`，并把 `resumes.filename` 切过去；
3. **不删除、不修改原文件**——原 `{uuid}.md` 原样留在磁盘上。

第 3 点是刻意的：迁移确认之前，原文件是元数据在**另一个卷上**的独立副本。数据库恢复不了文件，
文件恢复不了数据库，两者互为备份。

**不受影响的东西：** `version` 列与 `updated_at` **不会被这次迁移改动**。它改的是数据，不是用户
可见的修订，所以不会让任何客户端的版本号失效，也不会弹出一堆"简历已在别处被修改"。

### 备份（两步都要做）

```bash
# ① 数据库
docker exec mydash-postgres pg_dump -U postgres resume_vault \
  | gzip > ~/backup/resume_vault-$(date +%Y%m%d-%H%M%S).sql.gz

# ② 简历文件——只备份数据库是不够的，frontmatter 在这里
#    容器内路径是 /data/resumes（compose 里由 ./runtime/resumes 挂载进来）
tar czf ~/backup/resumes-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C ~/my-dashboard-stack/runtime resumes
```

### 上线前先在小规模库上演练

迁移逻辑可在**备份库 + 文件副本**上原样重放：`BackfillMetadataFromFiles` 的目录与数据库都是参数，
不依赖任何包级状态。重放第二次时 `updated = 0`——这条也是幂等性的判据。

```bash
# 在备份库上演练（go test 内的真实 Postgres 验证）
T17_TEST_DSN='host=... dbname=restore_check sslmode=disable' \
  go test ./internal/biz/resumevault/ -run TestBackfillAgainstRealPostgres -v
```

### 前后对比

```bash
# 迁移前
docker exec mydash-postgres psql -U postgres resume_vault -c \
  'SELECT id, name, job_title, email, filename FROM resumes ORDER BY id;'

# 启动新二进制（迁移在启动时自动执行），然后
docker exec mydash-postgres psql -U postgres resume_vault -c \
  'SELECT version, name, applied_at FROM schema_migrations ORDER BY version;'
```

`version = 2` 出现在 `schema_migrations` 里即表示迁移完成。日志中会有一行：

```
INFO msg=resume metadata backfill: scanned=N updated=N already-complete=N relocated=N unreadable=0
```

`unreadable > 0` 会升级为 `WARN` 并逐个列出文件名。**它不会导致启动失败**——单个读不到的文件
不应该让整个服务起不来——但要去核对那些文件是否真的丢了。

### 恢复（迁移出错时）

```bash
cd ~/my-dashboard-stack && docker compose down

# ① 先恢复文件，再恢复数据库：数据库里的 filename 指向文件，顺序反了会出现短暂的不一致
tar xzf ~/backup/resumes-<时间戳>.tar.gz -C ~/my-dashboard-stack/runtime

# ② 再恢复数据库
gunzip -c ~/backup/resume_vault-<时间戳>.sql.gz \
  | docker exec -i mydash-postgres psql -U postgres resume_vault

# ③ 旧版镜像可以正常启动：库的 schema_migrations 回到了 version = 1
docker compose up -d
```

回滚**镜像**（不动数据库）只要镜像不早于库里记录的版本即可，理由见第 8 节。

### 迁移确认之后：清理原文件

原 `{uuid}.md` 被保留是为了可恢复。**确认迁移无误、且已保留一段时间（建议一个完整备份周期）之后**，
可以删除这些不再被引用的文件：

```bash
# 先只列出来，确认数量与预期一致——被引用的文件不会出现在这里
docker exec mydash-kratos sh -c '
  for f in /data/resumes/*.md; do
    case "$f" in *.body.md) continue;; esac
    echo "$f"
  done'
```

删除之前，`~/backup/resumes-*.tar.gz` 必须已经存在并且验证可解压。这些原文件删除后，
frontmatter 的唯一副本就是数据库的列了。

### 过渡期行为（已知，且是有意的）

迁移后服务端只存正文，所以编辑器里那个 frontmatter 表单会显示为空——**而 9 个列里的值都是好的**，
API 返回的 `resume.name`、`resume.email` 等字段取值正常。工单 15（元数据编辑面板）会把那个表单
换成读写列的界面。这是"先切换读取路径、再剥离"的预期中间状态，不是故障。

---

## 8.4 内容版本历史（工单 16 / ADR-0010）

### 这次迁移改了什么

**只有加法**：新建 `resume_versions` 表并加一个索引，不改动、不删除任何既有表或列。

- 迁移条目 `version = 3`（`create_resume_versions_table`）执行两条幂等语句：
  `CREATE TABLE IF NOT EXISTS "resume_versions"` 与 `CREATE INDEX IF NOT EXISTS "idx_resume_versions_resume_version"`。
- 表结构：`id` / `resume_id` / `version` / `markdown` / `created_at` / `created_by`。
- **没有外键。** 简历删除时由业务代码显式删除其历史（`DeleteByResumeID`）；不加外键是为了不让数据库在
  删除简历时替应用做决定（级联删或阻塞删都是一种隐含策略）。
- **`resumes` 表在此迁移中完全不动**，`version` 列由上一步（`version = 1`）负责。

### 存量数据会怎样

**不会有历史记录。** 该表从空开始，用户下次保存时才产生第一条快照。这不影响任何既有功能——
历史是新增能力，不是既有数据的迁移。用户看到"还没有历史版本"是正确状态，不是故障。

### 新增配置项

```yaml
resume:
  storage_dir: "/data/resumes"
  history_limit: 50        # 每份简历保留的快照条数上限
```

| 值 | 行为 |
|---|---|
| 未写 / `<= 0` | 回落为默认 **50**。**0 不表示"不保留历史"**——让"忘记配置"与"保留 0 条"等价会让整个功能静默消失 |
| 正整数 | 该简历保留的最新 N 条；超出后在每次追加时**自动删除最旧的** |

存储估算：一份 10 KB 的 Markdown × 50 条 × N 份简历。自托管规模下可接受，但这是**全项目唯一
没有服务端大小限制的字段**，磁盘紧张时请调小这个值。

### 部署顺序

与 8.1 相同的顺序，且**后端必须先于前端**：

1. **先部署后端。** 启动日志会打印 `migration: applied ... create_resume_versions_table`，
   随后是 `migration: up to date (schema version 3)`。
2. **再部署前端。** 旧前端不认识历史接口，但也不会调用它们，因此只部署后端不会破坏任何页面。

验证迁移已完成：

```bash
docker exec mydash-postgres psql -U postgres -d resume_vault \
  -c 'SELECT version, name, applied_at FROM schema_migrations ORDER BY version;'
# version = 3 / create_resume_versions_table 出现即完成
```

### 已在小规模库上演练（必做步骤，已完成）

该迁移会作用在**有真实数据**的库上，因此上线前用 `pg_dump --schema-only` 克隆生产结构到 scratch 库、
用隔离配置启动真实二进制做过完整预演：

- 从"有 `resumes` 表、无 `version` 列、无 `schema_migrations`"的状态开始；
- 迁移 0/1/2/3 全部成功，既有简历行的 `version` 回填为 `1`；
- **第二次启动**打印 `migration: up to date (schema version 3)`，`applied_at` 与 `checksum` 均未变化，
  没有重放、没有被拒绝启动；
- HTTP 端到端跑通：空历史 → 两次保存 → 列历史 → 取单版本 → 过期版本回滚得 `409 VERSION_MISMATCH`
  → 正确回滚产生新版本且**历史一行未删** → 非 owner 得 `403 NO_ACCESS`。

因此本次发布**不需要** 8.3 那样的双份备份演练脚本；常规的发布前数据库快照（见第 8 节开头）即可。
新迁移是纯加法，出错时删掉 `resume_versions` 表并把 `schema_migrations` 里 `version = 3` 那行删掉
就能回到原状。

### 回滚

删掉 `version = 3` 的记录并删除 `resume_versions` 表，旧镜像即可正常启动。**注意**：这会丢失全部
已生成的历史快照（它们是用户内容的安全网），因此除非确实需要，否则不要回滚这一条。

---

## 8.5 展示态 JSONB 列（工单 19 / ADR-0004）

### 这次迁移改了什么

迁移 **v4 `add_resume_presentation_column`**，一条语句：

```sql
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "presentation" JSONB
```

- **纯加法，不可空、无默认值、不需回填。** `NULL` 就是有意义的值「没存过展示态」，读取侧转成
  默认展示态。不设 `DEFAULT '{}'::jsonb` 是因为那会让后续读取再也分不清「从没设过」与「显式
  清空」，还要在大表上做一次全表重写。
- 语句里带 `IF NOT EXISTS`，所以重复执行不会失败。
- 不涉及文件系统，**无需** 8.3 那样的简历文件备份。

### 存量数据会怎样

不会怎样。既有简历行的 `presentation` 为 `NULL`，页面按默认展示态（石棕主色、serif、1.0 字号、
1.5 行距、18mm 页边距、默认章节顺序）渲染。**第一次保存样式时才会写入这一列。**

### 部署顺序

与 8.1 相同的顺序，**后端必须先于前端**：

1. **先部署后端。** 启动日志会打印 `migration: applied ... add_resume_presentation_column`，
   随后是 `migration: up to date (schema version 4)`。
2. **再部署前端。** 旧前端不认识展示态接口，也不会调用它，所以只部署后端不破坏任何页面。

验证迁移已完成：

```bash
docker exec mydash-postgres psql -U postgres -d resume_vault \
  -c 'SELECT version, name, applied_at FROM schema_migrations ORDER BY version;'
# version = 4 / add_resume_presentation_column 出现即完成

docker exec mydash-postgres psql -U postgres -d resume_vault \
  -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'resumes' AND column_name = 'presentation';"
# 期望一行：presentation | jsonb | YES
```

第二句是必要的，不只是好看：`schema_migrations` 里有一行记录**不代表列真的存在**。`ALTER TABLE
... ADD COLUMN IF NOT EXISTS` 在列已存在时是**静默跳过**的，所以一个手工创建的、类型不对的
`presentation` 列会让迁移「成功」而留下 `presentation` 是 `text` 的库——直到第一次写入 JSONB
才报错。直接问 `information_schema` 才是证据。

### 回滚

删掉 `schema_migrations` 里 `version = 4` 那行并 `ALTER TABLE "resumes" DROP COLUMN presentation`
即可让旧镜像正常启动。

**注意**：这会**丢掉用户已保存的全部样式设置**（主色、字体、字号、页边距、章节顺序）。样式是
用户偏好而不是内容，所以丢的不会是简历正文；但用户会看到自己调过的样式被重置回默认值，因此
除非确实需要，不要回滚这一条。若只是想让新前端不可用，把前端镜像回滚即可：旧前端不读这一列，
多出来的列完全无害。

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

### 9.1 本地开发数据库在哪（一次排错记录）

部署栈（`deploy/docker-compose.yml`）里 postgres **不发布任何宿主端口**——后端经 `mydash-net` 用
`mydash-postgres:5432` 访问。所以 `127.0.0.1:5432` 上的东西**不是**部署栈的容器。

本机上它实际是 **WSL 里跑的 PostgreSQL 16.11**，判定依据（三条互相独立）：

| 证据 | 结果 |
|---|---|
| `Get-Process postgres` | Windows 上一个都没有 |
| `netstat -ano` 找 LISTEN 5432 | **没有监听项**，只有一堆到 `127.0.0.1:5432` 的客户端 socket（TIME_WAIT，以及一条 ESTABLISHED）——这是 WSL2/Hyper-V 端口转发的特征 |
| `SELECT version()` | `PostgreSQL 16.11 on x86_64-pc-linux-musl`（Linux 内核） |
| 进程 | `wsl` / `vmmemWSL` / `wslservice` 在跑 |

Windows 服务 `postgresql-x64-18` 显示 **Stopped**，与上述不矛盾：它就是没在用。

**门禁怎么连它（`kratos-server` 的连库测试用这组变量）**：

```
host=127.0.0.1 port=5432 user=postgres password=postgres dbname=postgres sslmode=disable
```

赋给 `MIGRATE_TEST_DSN` / `T16_TEST_DSN` / `T17_TEST_DSN` / `T19_TEST_DSN`。

两个坑：

- 用 `dbname=postgres`，**不要**用 `configs/config.yaml` 里的 `infra`——那个库不存在。
- 用 `127.0.0.1`，**不要**用 `localhost`——后者会先试 `::1` 并卡约 1 秒再回落。

因此这些连库测试在**本机是真的在跑**，不是 `t.Skip`。这也意味着它们依赖本机环境，不适合当作
无依赖的 CI 门禁。


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
