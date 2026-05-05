# 正式環境 Dockerfile — 多階段 build
#
# Stage 1: 安裝完整依賴（含 dev）→ 跑 vite build + esbuild server
# Stage 2: 只裝 production 依賴 + 把 dist/、drizzle/、必要 runtime files 帶過去
#
# `pnpm build` 產出：
#   • dist/index.js           ← 後端入口（esbuild --outdir=dist 從 server/_core/index.ts）
#   • dist/public/...         ← 前端靜態資源（vite build）
#
# 啟動命令在 docker-compose.yml 裡（先 migrate 再 start）。

FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
# pnpm.patchedDependencies 設定的 patch 檔在 install 階段就要讀，必須一起 copy
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
# drizzle-kit 是 devDependency，但 production 容器裡需要跑 migrate，所以這邊也要全裝
# patches/ 同樣要帶進來，不然 pnpm 找不到 patchedDependencies 設定的 patch 檔
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/shared ./shared
# drizzle-kit migrate 需要 config 才找得到 schema 路徑
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 3000

CMD ["node", "dist/index.js"]
