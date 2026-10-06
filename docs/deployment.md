# 正式部署文档（P0）

> 版本：v1.0 · 2026-10-05
> 状态说明：**Docker 配置已完成**；本机（Windows 开发机）无 Docker/WSL2，**Compose 实际运行验证需在部署机完成**。二者明确区分，不混为一谈。

## 1. 部署形态

```text
部署机（Docker Engine + Compose v2）
├── postgres:16     # 数据卷 pgdata 持久化 + healthcheck
├── api             # NestJS：启动时 prisma migrate deploy → node dist/main.js
└── web             # nginx：静态托管 Web 构建产物 + 反向代理 /api → api:3000
volumes:
  pgdata            # PostgreSQL 数据
  uploads           # 文件存储（api /app/uploads）
```

- Mobile 不进入 Docker：作为正式客户端经公网 API 连接生产。
- 单部署机、单网络（Compose 默认网络）；无 K8s / 微服务 / Service Mesh。

## 2. 交付的 Docker 文件清单

| 文件 | 作用 |
|---|---|
| `docker-compose.yml` | 三服务编排（postgres/api/web）、环境变量注入、端口、卷、依赖关系（api 等待 postgres healthy） |
| `apps/api/Dockerfile` | api 镜像：安装 api+shared-types 依赖 → 构建 shared-types → prisma generate → nest build → 启动时 migrate deploy |
| `apps/web/Dockerfile` | web 镜像：多阶段构建（node 构建 → nginx 运行） |
| `apps/web/nginx.conf` | nginx：托管 SPA + `/api` 反向代理到 api:3000 + SPA 路由回退 |
| `.dockerignore` | 控制构建上下文（排除 node_modules/dist/.env/apps/mobile 等） |
| `.env.example` | 全部环境变量样例（生产复制为 `.env` 后修改） |

## 3. 环境变量

生产 `.env`（部署机 root）至少配置：

```env
POSTGRES_USER=huahua
POSTGRES_PASSWORD=<强密码>
POSTGRES_DB=huahua
JWT_SECRET=<≥32 字节随机值>
JWT_EXPIRES_IN=30m
REFRESH_TTL_DAYS=30
CORS_ORIGINS=https://your-domain.example
ATTENDANCE_TIMEZONE=Asia/Shanghai
```

Compose 内 api 的 `DATABASE_URL` 由服务间主机名 `postgres` 拼接（compose 内已处理，无需手改）。

## 4. 部署机启动步骤

```bash
# 0) 前置：Docker Engine + Compose v2（部署机安装，非本项目职责）
docker --version
docker compose version

# 1) 获取代码
git clone <repo> huahua && cd huahua

# 2) 配置环境变量
cp .env.example .env
#   编辑 .env：替换 JWT_SECRET / POSTGRES_PASSWORD / CORS_ORIGINS

# 3) 构建并启动（首次会构建 api/web 镜像）
docker compose up -d --build

# 4) 验证
docker compose ps                      # 三服务 running
curl https://your-domain/api/health    # {"status":"ok","db":"up",...}
```

- **Prisma migration**：api 容器入口自动执行 `pnpm prisma migrate deploy`（无需手工）；后续 schema 变更发布新镜像后自动应用。
- **反向代理**：`https://your-domain/api/*` → nginx → `api:3000`（同域，避免 CORS 复杂性；跨域时配 `CORS_ORIGINS`）。
- **升级**：`git pull && docker compose up -d --build`
- **备份**：pgdata/uploads 卷 → `docker run --rm -v huahua_pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata.tar.gz /data`（按需）。

## 5. 本地开发（无 Docker，Windows 开发机）

```bash
# 依赖
pnpm install
# 本地 PostgreSQL 16（服务已运行）——按本地环境创建 huahua 库与账号（见 .env DATABASE_URL）
# 迁移
pnpm db:generate && pnpm db:migrate
# 三端
pnpm dev            # api(3000) + web(5173)，vite 代理 /api → 3000
pnpm dev:mobile     # expo start（真机/模拟器，EXPO_PUBLIC_API_URL 指向本机/公网 API）
```

## 6. 验证矩阵（部署机验收）

| 项 | 命令/方式 | 预期 |
|---|---|---|
| postgres | `docker compose ps` | healthy |
| api | `curl .../api/health` | `{"status":"ok","db":"up"}` |
| web→api 反代 | `curl .../api/health`（经 nginx） | 同上 |
| auth | 注册/登录/刷新/登出（§auth-design） | 通过 |
| uploads | api 写 `uploads/` 卷 | 落盘到卷 |
| mobile | 公网 API 直连 | 登录/刷新通过 |

> **2026-10-05 Docker 最终验证已完成（本机 Docker Desktop 4.86 / Engine 29.7.2 / Compose v5.3.1）**：
> - `docker compose up -d --build`（`WEB_PORT=8500`，本机适配见 §7）→ postgres healthy、api/web 启动、`prisma migrate deploy` 执行（No pending migrations）。
> - `/api/health` 经 api:3000 与 nginx:8500 均 200 且 `db=up`；注册/登录/me 经 nginx 全链路通过；`uploads` 卷落盘；`docker compose restart` 后用户登录与 uploads 文件均持久。
> - 本机适配：`8080` 被 Windows（Hyper-V）保留端口占用 → `.env` 设 `WEB_PORT=8500`（已在 .env 记录）。

> **2026-10-05（P2 收口后复验，Docker Engine 29.7.2）**：
> - 重建镜像：`docker compose up -d --build` → `time-api` / `time-web` 重新构建（旧镜像为 6-7 小时前的代码）。
> - **`WEB_PORT=8500` 本次失败**：Windows 保留端口段已变为 `8451-8550`（保留段随重启变化，见 §7）→ 改用 `WEB_PORT=18080`（.env 已更新，`.env.example` 同步说明）。
> - 三容器 Up：postgres(healthy, 5432) / api(3000) / web(nginx, 18080)；`/api/health` 经 api:3000 与 nginx:18080 均 200 且 `db=up`，`/` 200。
> - **端到端冒烟（经 nginx）**：`scripts/p2-smoke.ps1` → 38/38 通过（家庭入口 → 建任务 → 提交 → 家长确认 → 发奖励，含多租户与越权负例），等价覆盖 §6 的 auth/api/反代三项。
> - 主机侧不再需要 `nest start --watch`（本项目已切换为 Docker 运行）；旧项目 huahuastudy 与 tasklabs 预览进程不受影响。

## 7. 本机端口适配记录（仅本地，非架构变更）

| 端口 | 用途 | 本机适配 | 原因 |
|---|---|---|---|
| **18080** | web（nginx 宿主端口） | `WEB_PORT=18080`（.env） | Windows 保留端口段随重启变化：先占 8080，2026-10-05 又占 **8451-8550**（含原用的 8500）→ 改用远离动态段的 18080 |
| 3000 | api 宿主端口 | 无（默认） | 旧项目 dev 服务或旧容器占用时需先停 |
| 3100 / 5174 | 本地开发（非 Docker）api / vite | 环境变量覆盖 | 旧项目 dev 服务占用 3000/5173 |
| 5433 | （如启用）备用 postgres 宿主端口 | 未启用 | 5432 已有 postgres 实例/容器 |

> 排查 Windows 保留端口段（端口"被占用"但无进程监听时先查这个）：
> `netsh int ipv4 show excludedportrange protocol=tcp`
