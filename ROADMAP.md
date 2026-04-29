# i18n Manager - 短期功能路線圖（1-3 個月）

> 規劃週期：2026-05 ~ 2026-07
> 文件版本：v1.0（2026-04-29 制定）
> 維護者：研發團隊

---

## 1. 路線圖總覽

本路線圖涵蓋三個月的迭代規劃，分為三個 Sprint，每個 Sprint 約 4 週。每個 Sprint 都會明確區分「必須交付（P0）」、「應該交付（P1）」、「期望交付（P2）」三個優先級，以確保在資源緊縮時也能保有可發佈的成果。

| Sprint | 期間 | 主題 | 核心目標 |
|--------|------|------|----------|
| Sprint 1 | 2026-05-01 ~ 2026-05-29 | **資料雙向流通** | 補齊 JSON 匯入、擴充匯出格式、強化版本比對 |
| Sprint 2 | 2026-06-01 ~ 2026-06-26 | **協作與品質** | 翻譯討論、佔位符驗證、批次操作、AI 翻譯建議 |
| Sprint 3 | 2026-06-29 ~ 2026-07-24 | **整合與自動化** | CLI 工具、Webhook、CI/CD、權限細分至專案層級 |

---

## 2. 現況盤點（Baseline）

已交付能力（截至 2026-04-29）：核心資料模型（Locales / Projects / Keys / Translations / Versions / History / Exports）、四種角色權限（admin / editor / rd / qa）、巢狀 Key 編輯器（虛擬滾動，支援 1 萬筆）、Modal 與內聯雙模式編輯、版本快照、JSON 匯出、Docker 部署。

明顯缺口：
- **沒有 JSON / 檔案匯入功能**（只能匯出，無法回流）
- **匯出格式單一**（僅 JSON，缺 iOS `.strings` / Android XML / CSV / Excel）
- **缺 AI 翻譯輔助**（已有 `server/_core/llm.ts` 模組但未串接翻譯流程）
- **缺佔位符 / 變數一致性檢查**（如 `{0}`, `{{name}}` 跨語系是否對齊）
- **缺翻譯討論 / 註解協作**
- **缺 CI/CD pipeline**（無 `.github/workflows`）
- **缺對外 API Token / CLI**（無法在開發者工作流自動化）
- **角色權限無法細分到專案層級**（admin 看到全部專案）

---

## 3. Sprint 1：資料雙向流通（5 月）

主題：讓翻譯資料能進得來、出得去，並能清楚比較版本之間的差異。這是後續所有自動化整合的前提。

### 3.1 P0｜JSON 匯入功能

目前系統只能匯出 JSON，導致既有專案的翻譯檔無法導入，新團隊接入成本高。需支援：上傳單一 locale JSON、自動偵測巢狀結構並轉換為 dot-notation Key、衝突處理策略（覆蓋 / 跳過 / 合併）、預覽差異後再確認、匯入時自動產生對應的 `translation_history` 記錄。後端在 `server/routers.ts` 新增 `translationKey.importJson` mutation；前端在編輯器頁面工具列加上「匯入」按鈕並提供檔案選擇與預覽對話框。

驗收條件：能上傳 5,000+ Key 的 JSON 在 10 秒內完成解析與預覽；衝突處理策略可選；匯入後 history 表正確記錄每筆變更；附對應 Vitest 測試。

### 3.2 P0｜版本差異比對（Diff View）

目前歷程頁面只能看單筆異動，無法直觀比較「v1.2 對比 v1.3」全部變更。需提供版本選擇器（基準版 / 對比版）、按 Key 列出新增 / 修改 / 刪除、修改的 Key 顯示左右並排 diff（依 locale）、可篩選只看某一 locale。

驗收條件：可比較任意兩版本；diff 渲染 1,000 筆 Key 不卡頓；提供匯出 diff 為 markdown 報表的選項。

### 3.3 P1｜匯出格式擴充

新增三種匯出格式以對應前端 / iOS / Android / 翻譯廠商常見需求：
- **CSV / Excel**：每列一個 Key，欄位為各 locale 翻譯值，方便外部翻譯人員編輯
- **iOS `.strings`**：產生符合 Apple 規範的 strings 檔
- **Android `strings.xml`**：含 plurals、escape 處理

匯出對話框增加格式選擇與選項（例如是否包含未翻譯項）。

### 3.4 P2｜匯入歷史紀錄頁

每次匯入產生一筆「匯入批次」紀錄（時間、執行者、檔案名、影響筆數、衝突解決策略），可在歷程頁面看到並回滾。需新增 `translation_imports` 資料表。

---

## 4. Sprint 2：協作與品質（6 月）

主題：將工具從「翻譯儲存庫」升級為「翻譯協作平台」，並引入自動化品質檢查。

### 4.1 P0｜佔位符與變數一致性檢查

i18n 字串中的 `{0}`, `{{name}}`, `%s`, `<b>...</b>` 等若跨語系不一致會在 runtime 出錯。需在儲存時自動掃描所有 locale 的同一 Key，提取佔位符並比對；不一致時於編輯器以警告色標示並列出差異；提供「忽略此警告」選項（記錄至 `translations` 表新欄位）。

驗收條件：支援至少四種佔位符語法（ICU MessageFormat 子集、`{0}`、`{{name}}`、HTML tag）；批次健檢端點可一次掃描整個專案並回傳問題列表。

### 4.2 P0｜AI 翻譯建議

利用既有的 `server/_core/llm.ts`，在編輯器中當某一 locale 為空時，提供「一鍵以 AI 翻譯」按鈕。輸入：來源 locale 文字、目標 locale、Key 描述、同 namespace 已翻譯項目（作為風格 context）。輸出：建議文字（標記為「AI 草稿」狀態，需人工確認後才視為完成）。

驗收條件：單筆翻譯 < 3 秒；批次翻譯整個 namespace 的未翻譯項；AI 草稿在歷程中標記來源；可設定每日 token 上限避免費用失控。

### 4.3 P1｜翻譯討論（Comments）

新增 `translation_comments` 表（keyId、localeCode、userId、content、createdAt、resolved）。編輯器點 Key 時側邊顯示討論串；@ 提及其他使用者；解決後可摺疊。讓 RD 與翻譯人員可在系統內溝通而非外部 IM。

### 4.4 P1｜批次操作

提供：批次取代（依正則 / 子字串）、批次標記為已翻譯 / 未翻譯、批次套用 tag、批次刪除（軟刪除，可救回）。需在編輯器表格加入勾選欄與工具列。

### 4.5 P2｜未翻譯項報表

Dashboard 增加「翻譯缺口」區塊：依 locale × 專案顯示完成度、未翻譯 Key 數、建議優先處理的 Key（依使用頻率或 Tag 標記）。提供 CSV 匯出。

---

## 5. Sprint 3：整合與自動化（7 月）

主題：讓 i18n Manager 從「需要登入操作的網站」變成「能嵌入研發流程的服務」。

### 5.1 P0｜API Token 與 CLI 工具

開發者目前無法在 CI 中自動拉取 / 推送翻譯。新增：
- **API Token 管理頁面**（admin 限定，可建立 / 撤銷 / 設定範圍與到期日）
- **REST 端點**（`/api/v1/projects/:id/locales/:code` GET / PUT），與 tRPC 並存
- **CLI 工具**（`npx i18n-mgr pull / push / status`），打包至獨立 npm 套件

驗收條件：CLI 可在 GitHub Actions 中執行；token 失效後 API 回傳 401；token 操作完整記入 audit log。

### 5.2 P0｜專案層級權限

目前 admin / editor 看到全部專案，缺企業級隔離。新增 `project_members` 表（projectId、userId、role），保留 system-wide admin 角色但其他角色都需在專案內被授權。修改所有 router 加入專案權限檢查。

驗收條件：editor 在未被加入的專案中看不到 Key；admin 可在使用者管理頁面為使用者指派專案角色；既有資料遷移腳本將所有現有使用者預設加入所有專案以避免破壞性變更。

### 5.3 P1｜Webhook 通知

支援在事件發生時 POST 到外部 URL，事件包含：版本建立、JSON 匯出、批次匯入、Key 新增 / 刪除。Payload 含事件類型、專案、執行者、時間戳。需 HMAC 簽章驗證。常見用途：Slack 通知、自動觸發前端部署。

### 5.4 P1｜CI/CD Pipeline

建立 `.github/workflows/`：
- `ci.yml`：PR 觸發 `pnpm check` + `pnpm test` + lint
- `release.yml`：tag 觸發 Docker image 建置並推送至 registry
- `db-migrate-check.yml`：偵測 `drizzle/schema.ts` 變更時自動 dry-run 遷移

### 5.5 P2｜稽核日誌（Audit Log）

新增 `audit_logs` 表記錄所有寫入操作（含 token API 呼叫），admin 限定的稽核頁面可依使用者 / 動作 / 時間範圍查詢與匯出。

---

## 6. 跨 Sprint 持續性工作

以下項目不綁特定 Sprint，但團隊每個 Sprint 應預留約 20% 容量處理：

**測試覆蓋率**：目前僅 3 個 server 端測試檔，目標每個 Sprint 結束時覆蓋率 +15%。優先補齊 router 層整合測試。

**文件**：每個交付的功能須附使用說明，集中於 `docs/` 目錄。Sprint 結束時更新 `README.md` 與 `LOCAL_SETUP.md`。

**效能監控**：在 `server/_core/index.ts` 加入請求耗時記錄；對 > 1 秒的端點建警示。

**依賴升級**：每月一次安全性掃描（`pnpm audit`），critical 等級立即修復。

---

## 7. 風險與依賴

**AI 翻譯成本**：Sprint 2 的 AI 功能依賴 LLM API，需先確認預算上限與 fallback 策略（如達上限後降級為純人工）。建議第一週先做小規模 PoC 確認單字成本。

**權限重構的破壞性**：Sprint 3 的專案層級權限會影響所有 router，建議分兩階段：先上線權限表與 UI（不強制檢查），下一版本再啟用強制檢查，並提供完整遷移腳本。

**CLI 與 REST API 的同步維護**：tRPC schema 變動時 REST 端點需同步更新。建議用 OpenAPI 自動生成或共用 Zod schema 確保一致。

**MySQL 巨量資料**：當單一專案 Key 數突破 5 萬，現有 index 可能不足。Sprint 1 的匯入功能上線後應觀察並視情況優化。

---

## 8. 度量指標（Success Metrics）

每月月底檢視以下指標以判斷路線圖是否有效：

| 指標 | 目前基線 | 三個月目標 |
|------|---------|-----------|
| 翻譯總筆數（系統內） | — | 待定（看實際使用） |
| 平均翻譯完成度 | — | 各 locale > 95% |
| AI 翻譯採用率 | 0% | > 30% 草稿被人工確認 |
| 透過 CLI / API 操作比率 | 0% | > 20% 寫入操作來自 token |
| 測試覆蓋率（statement） | < 20%（估） | > 60% |
| Critical 安全漏洞 | 未知 | 0 |
| 95p API 回應時間 | 未測量 | < 500ms |

---

## 9. 變更紀錄

| 日期 | 版本 | 變更 | 異動者 |
|------|------|------|--------|
| 2026-04-29 | v1.0 | 初版建立，涵蓋三個 Sprint | Claude |

---

> 本路線圖為滾動式規劃，建議每個 Sprint 結束後 review 並調整下一個 Sprint 的範疇。
