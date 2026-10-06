# apps/web/Dockerfile —— 构建上下文为 monorepo 根目录
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter "@huahua/web..." --filter "@huahua/shared-types"

# 先构建 shared-types，再构建 web
RUN pnpm --filter @huahua/shared-types build
WORKDIR /app/apps/web
RUN pnpm build

# ---- 运行阶段：nginx（静态托管 + /api 反向代理）----
FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
