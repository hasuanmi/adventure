# apps/api/Dockerfile —— 构建上下文为 monorepo 根目录
# Debian 基础镜像：Prisma 5.22 的 musl 引擎硬链接 libssl.so.1.1（新版 Alpine 已移除该包），
# Debian(glibc) 使用 openssl-3.0.x 引擎，链接系统自带 libssl.so.3
FROM node:24-bookworm-slim AS base
RUN corepack enable
# Prisma 需要 openssl（slim 镜像不含）：检测并加载引擎（debian-openssl-3.0.x 链接 libssl.so.3）
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 依赖：api 及其 workspace 依赖（shared-types，含其 devDeps 以支持构建）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter "@huahua/api..." --filter "@huahua/shared-types"

# 先构建 shared-types，再生成 Prisma client、构建 api
RUN pnpm --filter @huahua/shared-types build
WORKDIR /app/apps/api
# Build-time has no real DB: generate only needs schema validation; placeholder URL is fine (runtime uses compose env)
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm prisma generate
RUN pnpm build

EXPOSE 3000
# 生产启动：先应用 migration，再起服务（Prisma migration 的容器启动方式）
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/main.js"]
