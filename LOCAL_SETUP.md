# i18n Manager - 本地開發設置指南

## 系統需求

- Node.js 18+ 或 22+
- pnpm 8+
- MySQL 8.0+ 或 TiDB

## 安裝步驟

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 環境變數配置

在專案根目錄建立 `.env.local` 檔案，複製以下內容並填入您的設定：

```env
# 資料庫連線
DATABASE_URL=mysql://user:password@localhost:3306/i18n_manager

# OAuth 設定（Manus OAuth）
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
JWT_SECRET=your_jwt_secret_key

# 擁有者資訊
OWNER_OPEN_ID=your_open_id
OWNER_NAME=Your Name

# Manus API（可選，用於高級功能）
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_FRONTEND_FORGE_API_KEY=your_frontend_api_key

# 分析（可選）
VITE_ANALYTICS_ENDPOINT=your_analytics_endpoint
VITE_ANALYTICS_WEBSITE_ID=your_website_id

# 應用設定
VITE_APP_TITLE=i18n Manager
VITE_APP_LOGO=your_logo_url
```

### 3. 資料庫設置

#### 選項 A：本地 MySQL

```bash
# 建立資料庫
mysql -u root -p -e "CREATE DATABASE i18n_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 執行遷移
pnpm drizzle-kit migrate
```

#### 選項 B：使用 Docker

```bash
docker run --name mysql-i18n \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=i18n_manager \
  -p 3306:3306 \
  -d mysql:8.0
```

然後執行遷移：
```bash
pnpm drizzle-kit migrate
```

### 4. 啟動開發伺服器

```bash
# 同時啟動前端和後端
pnpm dev
```

開發伺服器將在 `http://localhost:5173` 啟動（前端）
後端 API 在 `http://localhost:3000`

### 5. 執行測試

```bash
pnpm test
```

## 常見問題

### Q: 資料庫連線失敗？
A: 檢查 `DATABASE_URL` 是否正確，確保 MySQL 服務正在運行

### Q: OAuth 登入不工作？
A: 確保 `VITE_APP_ID` 和 `OAUTH_SERVER_URL` 正確配置

### Q: 前端無法連接後端？
A: 檢查後端是否在 `http://localhost:3000` 運行，確保 CORS 設定正確

## 開發工作流程

1. **編輯資料庫 Schema**：修改 `drizzle/schema.ts`
2. **生成遷移**：`pnpm drizzle-kit generate`
3. **執行遷移**：`pnpm drizzle-kit migrate`
4. **添加後端邏輯**：修改 `server/routers.ts` 和 `server/db.ts`
5. **添加前端 UI**：修改 `client/src/pages/` 中的元件
6. **運行測試**：`pnpm test`

## 專案結構

```
client/                 # React 前端
  src/
    pages/             # 頁面元件
    components/        # 可重用元件
    lib/trpc.ts        # tRPC 客戶端
    App.tsx            # 主應用
server/                # Express 後端
  routers.ts           # tRPC 路由
  db.ts                # 資料庫查詢函數
drizzle/               # 資料庫 Schema 和遷移
shared/                # 共享類型和常數
```

## 部署

本專案已配置為在 Manus 平台上部署。如需部署到其他平台，請參考 `package.json` 中的構建指令。

```bash
pnpm build
```

## 支援

如有問題，請檢查：
1. 所有環境變數是否正確設定
2. 資料庫是否正在運行
3. Node.js 版本是否符合要求
4. 所有依賴是否正確安裝
