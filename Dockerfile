# 农芯智境 · 多阶段构建（环境一致性 + 精简运行镜像）
# ---- 构建阶段 ----
FROM node:18-bullseye AS builder
WORKDIR /app

# 优先复制依赖清单以利用层缓存
COPY package*.json ./
RUN npm ci

# 复制源码并构建前端静态资源 + 后端 bundle
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:18-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# 仅安装生产依赖（server.cjs 以 --packages=external 打包，运行期需 node_modules）
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 数据持久化目录
RUN mkdir -p /app/.data
VOLUME ["/app/.data"]

EXPOSE 3000

# 容器健康检查（对接编排平台）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
