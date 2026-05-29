# ============================================================
# my-dashboard (Next.js) Dockerfile
# 多阶段构建: 安装依赖 → 构建 → 运行
# ============================================================

# -- Stage 1: 安装依赖 --
FROM node:20-alpine AS deps
WORKDIR /app

# 支持通过构建参数设置 NPM 镜像源
ARG NPM_REGISTRY=""
RUN if [ -n "$NPM_REGISTRY" ]; then \
        npm config set registry "$NPM_REGISTRY"; \
    fi

# 复制 package 文件
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

# 安装依赖
RUN if [ -f package-lock.json ]; then \
        npm ci --prefer-offline; \
    elif [ -f yarn.lock ]; then \
        yarn install --frozen-lockfile; \
    elif [ -f pnpm-lock.yaml ]; then \
        npm install -g pnpm && pnpm install --frozen-lockfile; \
    else \
        npm install; \
    fi

# -- Stage 2: 构建应用 --
FROM node:20-alpine AS builder
WORKDIR /app

ARG NPM_REGISTRY=""
RUN if [ -n "$NPM_REGISTRY" ]; then \
        npm config set registry "$NPM_REGISTRY"; \
    fi

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 设置环境变量用于构建
# NEXT_PUBLIC_* 变量会在构建时嵌入客户端代码
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# -- Stage 3: 运行 --
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物和必要文件
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# 如果存在其他配置文件也复制
COPY --from=builder /app/postcss.config.mjs* ./
COPY --from=builder /app/tsconfig.json ./

# 设置文件权限
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 30002

ENV PORT=30002
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]
