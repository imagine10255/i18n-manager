# Demo Seed Data

放在這裡的 `.sql` 檔案，會在 MySQL 容器**第一次啟動**時自動匯入（透過 MySQL 官方 image 的 `/docker-entrypoint-initdb.d/` 機制）。

## 規則

1. **檔名照字母順序執行**：多檔時請用 `01-xxx.sql`、`02-xxx.sql` 編號，避免依賴順序錯亂
2. **只在空 volume 時執行一次**：MySQL 看到 `/var/lib/mysql/` 已經有資料就不會再跑這些 init 檔。要重跑必須先 `docker compose -f docker-compose.demo.yml down -v` 把 volume 砍掉
3. **跟 drizzle-kit migrate 共存**：app 啟動時會跑 `drizzle-kit migrate`。如果 seed 已經建了 schema，drizzle migrate 看 `__drizzle_migrations__` 表決定要不要再跑 — 所以匯出 seed 時記得**包含 `__drizzle_migrations__` 表的資料**，否則 drizzle 會嘗試重跑所有 migration 然後失敗（表已存在）

## 怎麼產生 seed.sql

從你本地 dev DB 匯出（同時包含 schema + 資料 + drizzle 的 migration 狀態）：

```bash
mysqldump \
  -h 127.0.0.1 -P 3306 -uroot -proot \
  --single-transaction \
  --routines --triggers \
  --default-character-set=utf8mb4 \
  i18n_manager > demo-data/01-seed.sql
```

確認 dump 裡有這幾個關鍵段落：

- `CREATE TABLE` 各 i18n 業務表
- `CREATE TABLE __drizzle_migrations__`（drizzle migrate 的記帳表）
- `INSERT INTO __drizzle_migrations__` 該有的 row（讓 drizzle 知道 migration 都跑過了）
- `INSERT INTO` 各業務表的 demo 資料

## 注意事項

- 不要 commit 包含真實使用者密碼 hash / 真實 email 的 dump
- 檔案太大（>10MB）建議改成 git LFS 或在部署時另外下載，不要直接塞進 repo
- 修改 schema 後要重新 dump，舊 seed 跟新 schema 會對不起來
