# Docker 容器化開發環境指南

## 快速開始

### 開發環境（推薦）

一鍵啟動完整的開發環境（包含 MySQL 和應用）：

```bash
# 啟動開發環境
docker-compose --profile dev up -d
```

開發環境將在以下地址可用：
- **前端**：http://localhost:5173
- **後端 API**：http://localhost:3000
- **MySQL**：localhost:3306 (用戶: i18n, 密碼: i18n_password)

### 生產環境

```bash
# 建立 .env 文件（參考下方環境變數配置）
cat > .env << EOF
MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=i18n_manager
MYSQL_USER=i18n
MYSQL_PASSWORD=your_password
VITE_APP_ID=your_app_id
JWT_SECRET=your_jwt_secret
OWNER_OPEN_ID=your_owner_id
OWNER_NAME=Your Name
EOF

# 啟動生產環境
docker-compose --profile prod up -d
```

生產環境將在以下地址可用：
- **應用**：http://localhost:3000

## 常用命令

### 查看日誌

```bash
# 查看所有服務日誌
docker-compose logs -f

# 查看特定服務日誌
docker-compose logs -f app-dev
docker-compose logs -f mysql

# 查看最後 100 行日誌
docker-compose logs --tail=100 app-dev
```

### 停止服務

```bash
# 停止所有服務
docker-compose down

# 停止並刪除數據
docker-compose down -v
```

### 進入容器

```bash
# 進入應用容器
docker-compose exec app-dev sh

# 進入 MySQL 容器
docker-compose exec mysql mysql -u root -p
```

### 重新構建

```bash
# 重新構建應用鏡像
docker-compose build app-dev

# 重新構建並啟動
docker-compose build app-dev && docker-compose --profile dev up -d
```

## 環境變數配置

### 開發環境（使用預設值）

開發環境已配置預設值，可直接啟動：

```bash
docker-compose --profile dev up -d
```

預設配置：
- MySQL 用戶：`i18n`
- MySQL 密碼：`i18n_password`
- 應用端口：`3000`
- Vite 端口：`5173`

### 生產環境（需要配置）

建立 `.env` 文件並配置以下變數：

```env
# MySQL 配置
MYSQL_ROOT_PASSWORD=your_secure_root_password
MYSQL_DATABASE=i18n_manager
MYSQL_USER=i18n
MYSQL_PASSWORD=your_secure_password
MYSQL_PORT=3306

# 應用配置
APP_PORT=3000
NODE_ENV=production

# OAuth 設定（Manus OAuth）
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
JWT_SECRET=your_jwt_secret_key_change_in_production

# 擁有者資訊
OWNER_OPEN_ID=your_open_id
OWNER_NAME=Your Name

# Manus API
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
VITE_FRONTEND_FORGE_API_KEY=your_frontend_api_key

# 應用設定
VITE_APP_TITLE=i18n Manager
VITE_APP_LOGO=
```

## 數據持久化

MySQL 數據存儲在 Docker 命名卷 `mysql_data` 中，即使容器停止也會保留。

要完全清除數據：

```bash
docker-compose down -v
```

## 開發工作流程

1. **啟動開發環境**
   ```bash
   docker-compose --profile dev up -d
   ```

2. **編輯代碼**
   - 修改 `client/src/` 中的前端代碼
   - 修改 `server/` 中的後端代碼
   - 修改 `drizzle/schema.ts` 中的數據庫 schema

3. **查看變化**
   - 前端自動熱重載（Vite HMR）
   - 後端自動重啟（nodemon）
   - 查看日誌：`docker-compose logs -f app-dev`

4. **數據庫遷移**
   ```bash
   # 進入容器
   docker-compose exec app-dev sh
   
   # 生成遷移
   pnpm drizzle-kit generate
   
   # 執行遷移
   pnpm drizzle-kit migrate
   ```

5. **運行測試**
   ```bash
   docker-compose exec app-dev pnpm test
   ```

6. **停止開發環境**
   ```bash
   docker-compose down
   ```

## 故障排除

### 端口已被占用

如果 3000 或 5173 端口已被占用，修改 `.env`：

```env
APP_PORT=3001
VITE_PORT=5174
```

然後重新啟動：

```bash
docker-compose down
docker-compose --profile dev up -d
```

### MySQL 連接失敗

確保 MySQL 容器已啟動並健康：

```bash
docker-compose ps
```

如果 MySQL 不健康，查看日誌：

```bash
docker-compose logs mysql
```

重啟 MySQL：

```bash
docker-compose restart mysql
```

### 應用無法連接資料庫

檢查 `DATABASE_URL` 是否正確。容器內應使用服務名 `mysql` 而不是 `localhost`：

```env
DATABASE_URL=mysql://i18n:i18n_password@mysql:3306/i18n_manager
```

### 清除所有容器和卷

```bash
docker-compose down -v
docker system prune -a
```

### 查看容器狀態

```bash
# 列出所有容器
docker ps -a

# 查看容器詳細信息
docker inspect i18n-app-dev

# 查看容器資源使用情況
docker stats
```

## 性能優化

### 增加 MySQL 記憶體

編輯 `docker-compose.yml`，在 `mysql` 服務中添加：

```yaml
deploy:
  resources:
    limits:
      memory: 2G
    reservations:
      memory: 1G
```

### 優化 Node.js 記憶體

編輯 `docker-compose.yml`，在 `app-dev` 服務中添加：

```yaml
environment:
  NODE_OPTIONS: --max-old-space-size=2048
```

## 生產部署

### 構建生產鏡像

```bash
docker build -t i18n-manager:latest .
```

### 推送到鏡像倉庫

```bash
docker tag i18n-manager:latest your-registry/i18n-manager:latest
docker push your-registry/i18n-manager:latest
```

### 在 Kubernetes 中部署

參考 `k8s/` 目錄中的配置文件（如果存在）

### 使用 Docker Swarm 部署

```bash
docker swarm init
docker stack deploy -c docker-compose.yml i18n-manager
```

## 支援

如有問題，請檢查：
1. Docker 和 Docker Compose 是否正確安裝
2. 所有環境變數是否正確配置（生產環境）
3. 端口是否被占用
4. 磁盤空間是否充足
5. 查看容器日誌：`docker-compose logs -f`
