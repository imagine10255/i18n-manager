# 多階段構建：構建階段
FROM node:22-alpine AS builder

WORKDIR /app

# 複製 package 文件
COPY package.json pnpm-lock.yaml ./

# 安裝依賴
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 複製所有源代碼
COPY . .

# 構建應用
RUN pnpm build

# 多階段構建：運行階段
FROM node:22-alpine

WORKDIR /app

# 安裝 pnpm
RUN npm install -g pnpm

# 複製 package 文件
COPY package.json pnpm-lock.yaml ./

# 只安裝生產依賴
RUN pnpm install --frozen-lockfile --prod

# 從構建階段複製構建結果
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/public ./client/public
COPY --from=builder /app/shared ./shared

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "dist/server/index.js"]
