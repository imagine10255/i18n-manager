# Demo 部署指南

本文件說明如何把 i18n Manager 部署到一台 VPS 上作為 demo。整套 stack 全容器化（app + MySQL），DB 資料用 Docker named volume 持久化，不依賴外部資料庫服務。

正式環境部署不在本文件範圍內，請另外規劃（DB 獨立、HA、備份策略、log 集中等）。

## 適用情境

- 給人試玩用的 demo 站
- 內部測試環境
- 單機部署，不要求高可用

不適合：

- 正式上線（沒有 DB 備份/還原機制、沒有水平擴展）
- 多人並發大量寫入（單一 MySQL 容器）

## 前置需求

機器（建議規格）：

- Linux x86_64，2 vCPU / 2GB RAM 起跳
- Docker Engine 20.10+
- Docker Compose v2（`docker compose` 而不是 `docker-compose`）
- 對外 port：可設定，預設 8080

確認 Docker 可用：

```bash
docker --version
docker compose version
```

## 部署流程

### 1. 取得專案

```bash
git clone <your-repo-url> i18n-manager
cd i18n-manager
```

### 2. 設定環境變數

複製範本：

```bash
cp .env.demo.example .env.demo
```

編輯 `.env.demo`，至少要改：

| 變數 | 說明 |
| --- | --- |
| `JWT_SECRET` | 隨機長字串（建議 32 字元以上）。換掉會讓所有人重新登入 |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密碼 |
| `MYSQL_PASSWORD` | App 連 DB 用的密碼 |
| `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` | 第一次登入用的 bootstrap 帳密 |
| `APP_PORT` | 對外 port，預設 8080 |

產生 JWT_SECRET 的小技巧：

```bash
openssl rand -base64 32
```

### 3. 啟動

```bash
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d --build
```

第一次跑會 build image，大約 3–5 分鐘。

### 4. 確認服務起來

看 log：

```bash
docker compose -f docker-compose.demo.yml logs -f app
```

看到 `Server running on http://localhost:3000/` 就表示後端正常。MySQL 第一次啟動會跑初始化，等到 healthcheck 通過 app 才會啟動 migration。

開瀏覽器到 `http://<your-server-ip>:8080`，用 `.env.demo` 裡的 `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` 登入。

### 5. 建立正式 admin 帳號（可選）

進系統後從 UI 建一個正式 admin user，然後把 `.env.demo` 裡的 `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` 清空再 `up -d` 重啟，避免 bootstrap 帳密一直存在。

## 日常維運

### 看 log

```bash
# 只看 app log
docker compose -f docker-compose.demo.yml logs -f app

# 看 MySQL log
docker compose -f docker-compose.demo.yml logs -f mysql

# 全部一起看
docker compose -f docker-compose.demo.yml logs -f
```

Log 設定上限 10MB × 3 份輪替，不會把磁碟塞爆。

### 更新 demo（pull 新版本後重新部署）

```bash
git pull
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d --build
```

`--build` 會 rebuild image。Container 會 rolling restart，DB volume 不動所以資料不會掉。

如果 schema 有變動，app 啟動時會自動跑 `drizzle-kit migrate`。

### 重啟服務

```bash
docker compose -f docker-compose.demo.yml restart app
```

### 完全停掉

```bash
# 停容器但保留 DB 資料
docker compose -f docker-compose.demo.yml down

# 停容器並清掉 DB 資料（demo 重置）
docker compose -f docker-compose.demo.yml down -v
```

### 備份 DB

```bash
docker exec i18n-demo-mysql mysqldump \
  -uroot -p"$(grep MYSQL_ROOT_PASSWORD .env.demo | cut -d= -f2)" \
  --single-transaction \
  i18n_manager > backup-$(date +%F).sql
```

建議排個 cron 每天備份一次：

```cron
0 3 * * * cd /path/to/i18n-manager && docker exec i18n-demo-mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction i18n_manager > /backups/i18n-$(date +\%F).sql
```

### 還原 DB

```bash
docker exec -i i18n-demo-mysql mysql \
  -uroot -p"$MYSQL_ROOT_PASSWORD" \
  i18n_manager < backup-2026-05-05.sql
```

### 用 demo-data/ seed 範本初始化

`demo-data/` 資料夾下的 `.sql` 會在 MySQL **第一次啟動**時自動匯入（透過 docker-entrypoint-initdb.d 機制）。

適合用途：

- 新部署一台 demo，希望開機就有預設範例資料
- 把線上 demo 重置回乾淨範本狀態

產生 seed：

```bash
# 從你本地 dev DB 匯出（含 schema + 資料 + drizzle 的 migration 狀態）
mysqldump -h 127.0.0.1 -uroot -proot \
  --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 \
  i18n_manager > demo-data/i18n_manager.sql
```

部署到 demo 機器：

```bash
git pull
# 砍掉舊 volume，下次 up 就會自動跑 demo-data/*.sql
docker compose -f docker-compose.demo.yml down -v
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d
```

注意：

- 只在 **volume 為空** 時執行（第一次 up 或 `down -v` 之後）
- 單一檔案隨便命名沒差；多檔時用 `01-`、`02-` 開頭，會照字母順序跑
- dump 必須包含 `__drizzle_migrations__` 表的資料，否則 app 啟動時 drizzle migrate 會嘗試重跑所有 migration 然後失敗
- 不要 commit 包含真實使用者密碼 hash 的 dump
- 詳細說明見 [`demo-data/README.md`](./demo-data/README.md)

## 加 HTTPS（建議）

Demo 對外 port 直接用 HTTP 不太理想（cookie 會被中間人看到、瀏覽器會警告）。建議在前面包一層 Caddy 自動處理 Let's Encrypt 憑證。

最小 Caddyfile（假設 demo 域名是 `i18n-demo.example.com`，app 跑在 8080）：

```caddyfile
i18n-demo.example.com {
    reverse_proxy localhost:8080
}
```

把 Caddy 也丟進 docker-compose 即可，這部分不在本文件範圍。

## 安全注意事項

1. **`.env.demo` 不要 commit 進 git**（已在 `.dockerignore` / 應該也加進 `.gitignore`）
2. **`LOCAL_AUTH_*` 用完盡快清掉**，這是 bootstrap fallback，留著等於後門
3. **MySQL 故意沒對外暴露 port**，只在 docker network 內部連，不要為了方便 debug 把 3306 開出去
4. **demo 機器不要放真實業務資料**，被打掉不心疼為原則

## 疑難排解

**問題：app 啟動後馬上 exit**

看 log：

```bash
docker compose -f docker-compose.demo.yml logs app | tail -50
```

常見原因：

- `JWT_SECRET` 沒設 → 補上
- DATABASE_URL 連不上 → 檢查 MySQL 容器是否 healthy（`docker ps`）
- `drizzle-kit migrate` 失敗 → 看是不是 schema migration 有衝突

**問題：MySQL healthcheck 一直不過**

第一次啟動會跑 init scripts，可能要 30 秒以上。如果超過 1 分鐘還不過，看 mysql log：

```bash
docker logs i18n-demo-mysql
```

**問題：登入後 cookie 一直失效**

通常是 `JWT_SECRET` 在容器重啟之間被換掉了（例如 `.env.demo` 改了內容又重啟）。換 secret 後所有舊 cookie 會失效，重登就好。

**問題：要進 MySQL 容器看資料**

```bash
docker exec -it i18n-demo-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" i18n_manager
```

## 參考檔案

- [`docker-compose.demo.yml`](./docker-compose.demo.yml) — demo 部署的 compose 定義
- [`.env.demo.example`](./.env.demo.example) — 環境變數範本
- [`Dockerfile`](./Dockerfile) — production image 多階段 build
- [`.dockerignore`](./.dockerignore) — build context 排除清單
