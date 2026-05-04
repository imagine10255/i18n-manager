# i18n Manager — 本地開發設置

## 系統需求

- Node.js 18+ / 22+
- pnpm 8+
- MySQL 8.0+ 或 TiDB

## 1. 安裝依賴

```bash
pnpm install
```

## 2. 環境變數

複製 `.env.local.example`（或自己建 `.env.local`）填入：

```env
# 必填
DATABASE_URL=mysql://root:root@localhost:3306/i18n_manager
JWT_SECRET=請換成隨機長字串
OWNER_OPEN_ID=任何唯一字串都行，作為 fallback 登入的 openId

# 選用
OWNER_NAME=Your Name
LOCAL_AUTH_USERNAME=admin
LOCAL_AUTH_PASSWORD=admin123
VITE_APP_TITLE=多語系翻譯管理系統
```

說明：

- `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` 是「bootstrap 登入」 — 用來在還沒建任何 DB 使用者前進系統。建好 admin 後可以移除。
- 不再使用任何 OAuth；認證走純本機 email + password JWT。

## 3. 建資料庫

```bash
mysql -u root -p -e "CREATE DATABASE i18n_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
pnpm db:push
```

`db:push` 會跑 `drizzle-kit generate` + `drizzle-kit migrate`。

## 4. 啟動

```bash
pnpm dev
```

單一 process（Express + Vite middleware）跑在 <http://localhost:3001>。

第一次登入：

- 先用 `.env.local` 裡的 `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` 進系統
- 進去後到「使用者管理」建立 admin email + 密碼
- 之後就可以拿掉 `LOCAL_AUTH_*` 走真正的 email/password 登入

## 常用指令

```bash
pnpm dev          # 開發（Express + Vite HMR，3001 port）
pnpm build        # 打包前後端到 dist/
pnpm start        # 跑 production build
pnpm check        # TypeScript 型別檢查
pnpm test         # Vitest server-side tests
pnpm db:push      # drizzle-kit generate + migrate
pnpm format       # Prettier
```

## 開發循環

1. 改 schema：`drizzle/schema.ts` → `pnpm db:push`
2. 改後端：`server/db.ts` (queries) + `server/routers.ts` (tRPC routes)
3. 改前端：`client/src/pages/` + `client/src/components/`
4. `pnpm check` + `pnpm test`

## 專案結構

```
client/                  # React 前端（Vite）
  src/pages/             # 頁面元件
  src/components/        # 可重用元件
  src/lib/trpc.ts        # tRPC 客戶端
server/
  _core/index.ts         # Express + Vite middleware 入口
  _core/trpc.ts          # tRPC init / 中介層
  routers.ts             # 所有 tRPC routes
  db.ts                  # Drizzle 查詢函式
drizzle/
  schema.ts              # DB schema 來源
  *.sql / meta/          # 自動生的 migration
shared/                  # client/server 共用常數與型別
```

## 常見問題

**資料庫連線失敗** — 檢查 `DATABASE_URL`、確認 MySQL 服務有起、port/帳密對得上。

**忘記管理員密碼** — 暫時把 `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` 加回 `.env.local` 重啟，進系統重設後再移除。

**Migration 失敗（DROP INDEX 找不到）** — 通常代表 DB 跟 snapshot 對不上。看 `drizzle/<NNNN>_*.sql` 內容，必要時手動跑那條 SQL 或編輯 migration 檔（之前有過 `0009_orange_jubilee.sql` 因為 unique 約束跟舊 index 名衝突的案例）。
