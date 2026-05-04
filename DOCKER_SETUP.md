# Docker Compose 設置

## 系統需求

- Docker 24+ / Docker Compose v2

## 快速開始（開發環境）

開發環境內建合理預設值，直接起來就能跑：

```bash
docker compose --profile dev up -d
```

啟動後：

- 應用：<http://localhost:3001>（Express + Vite middleware 共用同一個 port）
- MySQL：localhost:3306（user: `i18n`，password: `i18n_password`，db: `i18n_manager`）

第一次登入用 `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD`（預設 `admin` / `admin123`）。進系統後到「使用者管理」建 admin 帳號，之後就可以拿掉 `LOCAL_AUTH_*` 走真正的 email + password 登入。

## 正式環境

建立 `.env`，至少填這幾個（其他用 docker-compose 的預設值就夠）：

```env
# DB
MYSQL_ROOT_PASSWORD=請改強密碼
MYSQL_USER=i18n
MYSQL_PASSWORD=請改強密碼
MYSQL_DATABASE=i18n_manager

# App
JWT_SECRET=請放隨機長字串（換金鑰會讓所有 cookie 失效）
OWNER_OPEN_ID=任何唯一字串都行（fallback 登入用）

# 一次性 bootstrap：建好 admin 後就把這兩行刪掉
LOCAL_AUTH_USERNAME=admin
LOCAL_AUTH_PASSWORD=請改強密碼

# 顯示
VITE_APP_TITLE=多語系翻譯管理系統
```

啟動：

```bash
docker compose --profile prod up -d
```

正式環境跑在 <http://localhost:3000>（容器內 `pnpm start` 預設 PORT=3000）。

## 常用指令

```bash
# 看 log
docker compose logs -f app-dev          # 或 app-prod

# 進容器
docker compose exec app-dev sh
docker compose exec mysql mysql -u root -p

# 停 / 全清
docker compose down                      # 停服務但保留資料
docker compose down -v                   # 連 mysql_data volume 一起清

# 重 build app image（改 Dockerfile* 後需要）
docker compose build app-dev
docker compose --profile dev up -d
```

## 資料庫 migration

dev 容器啟動時自動跑：`pnpm drizzle-kit migrate`。

如果你改了 `drizzle/schema.ts`：

```bash
# 在容器內生 migration
docker compose exec app-dev pnpm drizzle-kit generate

# 重啟讓 migrate 自動跑（也可以直接 exec migrate）
docker compose restart app-dev
```

## 環境變數對照表

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | ⭕ | 容器內由 compose 自動拼 `mysql://USER:PASS@mysql:3306/DB`，host 是 service name 不是 localhost |
| `JWT_SECRET` | ⭕ | JWT 簽章金鑰 |
| `OWNER_OPEN_ID` | ⭕ | fallback 登入時寫進使用者表的 openId |
| `OWNER_NAME` | | 顯示名稱 fallback |
| `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` | | bootstrap 登入；建好 admin 後可移除 |
| `VITE_APP_TITLE` | | Login 頁標題 |
| `MYSQL_*` | | MySQL 容器初始化用 |
| `APP_PORT` | | 對外 port（dev 預設 3001，prod 預設 3000） |
| `MYSQL_PORT` | | host 上對外 port，預設 3306 |

## 故障排除

**3001/3000/3306 port 已被佔用**：在 `.env` 改 `APP_PORT`、`MYSQL_PORT`，然後 `docker compose down && docker compose --profile dev up -d`。

**容器一直 restart**：`docker compose logs app-dev` 看錯誤。最常見是 `JWT_SECRET` 沒設、或 mysql 還沒 healthy 就被 connect。

**MySQL 連不上**：確認 `docker compose ps` 看 mysql 是 healthy。容器之間連線必須用 service 名 `mysql`，不是 `localhost`。

**改了 Dockerfile 沒生效**：要 rebuild — `docker compose build app-dev` 後再 up。

**Migration 失敗（DROP INDEX 找不到等）**：通常是 DB 跟 schema snapshot 對不上。看 `drizzle/<NNNN>_*.sql` 內容，必要時 `docker compose exec mysql mysql -u root -p` 進去手動處理。
