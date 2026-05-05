# i18n Manager

> 一站式多專案、多語系翻譯管理平台 — 從詞條維護、跨專案共用字典、版本控管，到送翻譯社的 Excel 匯入匯出，全部在同一個工具裡完成。

採用 **單伺服器 Full-stack** 架構（Express + Vite + tRPC + Drizzle ORM + MySQL / TiDB），前後端共用 TypeScript 型別，部署只要一個 Node 程序。

---

## 工具特性

### 多專案 × 多語系架構
同一個資料庫底下可以同時管理「系統前端」、「遊戲前端」、「美術文案」等多個獨立專案，每個專案可指定自己的語系白名單（例如系統只開繁中／英文，遊戲開繁中／簡中／日文／韓文），互不干擾。語系本身集中管理，可調整啟用狀態與排序，改 locale code 時資料庫內所有引用會 cascade 更新。

### 巢狀翻譯 Key 編輯器
Key 採 dot-notation（例如 `auth.login.title`），編輯器會自動展開成資料夾樹狀結構，支援：

- TanStack Virtual 虛擬捲動，數萬筆 key 也不卡
- Sticky 欄位 — Key 永遠固定在左側，操作選單固定在右側
- 整資料夾批次刪除、拖拉重新排序、依命名重排
- 修改後集中暫存，一次 batch 儲存（少打 N 次 round-trip）
- 版本檢視會亮顯該版本內被異動過的 cell，方便 review

### 公版字典（Shared Keys）— 跨專案 i18n $ref
靈感來自 Apifox 的 model `$ref`：

- 把跨專案重複出現的詞條（例如「確定 / 取消 / 必填」）建在公版字典池裡
- 任何專案 key 都能引用公版 key — 公版內容一旦更新，所有引用它的專案立即同步生效
- 也支援「複製當下值後解除引用」模式，需要客製化的詞條就獨立維護
- 編輯器在公版來源 cell 上會顯示「公版」徽章，避免誤改

不論是 link 模式還是 copy 模式都有完整 history，不會把跨專案治理變成黑盒子。

### 版本控管 + 完整變更歷史
每個專案都有獨立的 version 序列，每次儲存可掛上 versionId，搭配以下幾層審計資料：

- `translation_history` — 每次 create / update / delete 的逐筆紀錄（含 oldValue / newValue / 操作者 / 時間）
- `translation_snapshots` — 整份版本快照，把該版本當下所有 key×locale 的值整份寫入，用於回溯整體狀態
- `translation_exports` — 每次匯出的 JSON 內容快照，保留可追溯的對外交付檔

History 頁支援依 key、locale、version、operator、project 等維度過濾，找問題時不用翻 git。

### 翻譯社 Excel 流程
真實的多語系維運免不了要送翻譯社，此工具直接內建一條完整流程：

- **匯出 .xlsx**：選定「源語系」與多個「target 語系」，可選「只匯出未翻譯」或整份，可帶 description；用 SheetJS 組成 workbook，每個 target 一個 sheet
- **匯入 .xlsx**：翻譯社回填後直接上傳，系統會 diff 出變更並寫入翻譯與 history
- **匯出整包 ZIP**：JSZip 一鍵打包所有啟用語系的巢狀 JSON（i18next 直接可吃），方便丟進前端 build pipeline

匯入匯出都做純函式，可以走測試 (`pnpm vitest run server/i18n.test.ts`)。

### 巢狀 JSON 匯出 / 平面化匯入
詞條雖然以平面 keyPath 存在 DB，但匯出時會自動還原成巢狀 JSON（前端 i18next 慣用格式）；匯入時也會把巢狀 JSON 攤平成 keyPath，讓匯出與匯入完全對稱。

### 角色權限分級
共四種角色：

| 角色      | 寫入翻譯 | 管理 Key / 版本 | 管理使用者 / 語系 / 專案 |
|-----------|:---:|:---:|:---:|
| `admin`  | ✅ | ✅ | ✅ |
| `editor` | ✅ | ✅ | ❌ |
| `rd`     | ❌（唯讀） | ❌ | ❌ |
| `qa`     | ❌（唯讀） | ❌ | ❌ |

權限由 tRPC middleware（`adminProcedure` / `editorProcedure`）在 server 端強制執行，UI 只是配合把按鈕 disable，不會出現「按下才被打回票」的尷尬狀況。

### 本地帳號 + JWT 登入
不依賴外部 OAuth provider — Email + 密碼登入即可（密碼採 scrypt + salt 雜湊），JWT 簽名透過 `jose` 處理並寫入 HTTP-only cookie，每筆 tRPC 請求都會在 `authenticateRequest` 裡驗章。也支援自助修改密碼、admin 預先建立帳號等情境。

### 軟刪除 + 可復原
專案、key 都採軟刪除：

- 列表預設隱藏，但所有 history / snapshot / export 都保留
- Admin 可在「專案管理」頁面把已停用的專案復原
- 若要永久刪除，必須先軟刪除過一次再二次確認專案名稱才會 cascade 清掉，避免手滑

### 進度儀表板
Dashboard 直接掃描 `translations` 統計各語系翻譯完成度，並用顏色區分「完整 / 進行中 / 部分 / 待翻譯」狀態，掌握整體進度只要看一眼。

---

## 為什麼選這個工具

- **型別端到端安全**：tRPC 把 server router 的型別直接餵給 React Query，client 沒有 OpenAPI / codegen 步驟，schema 改了 build 直接報錯
- **單一程序部署**：dev 是 Vite middleware 跑在 Express 內，prod 是 esbuild 把 server 打成單檔 ESM，少一層 nginx / proxy 配置
- **資料模型完整**：locale / project / key / translation / version / snapshot / export / history / shared 全部一次到位，不是「先做 MVP 之後再補審計」
- **雙向相容 i18next**：匯出格式就是巢狀 JSON，前端不需要寫 adapter
- **效能不靠話術**：編輯器用 TanStack Virtual + batch update + sticky 欄位，數萬筆翻譯實測仍然順暢
- **完整審計**：每一筆改動都進 `translation_history`，誰、什麼時候、改了什麼一目了然

---

## 技術棧

**後端**：Node.js · Express 4 · tRPC v11 · Drizzle ORM · MySQL 8 / TiDB · `jose` (JWT) · `mysql2` · esbuild

**前端**：React 19 · TanStack Query · TanStack Virtual · Wouter · Tailwind CSS v4 · shadcn/ui (Radix) · `lucide-react` · `sonner` · `framer-motion`

**工具與檔案處理**：Vite 7 · TypeScript 5.9 · Vitest · `xlsx` (SheetJS) · `jszip` · drizzle-kit

---

## 快速開始

```bash
pnpm install
pnpm db:push          # 初始化 / 套用 schema
pnpm dev              # http://localhost:3001
```

常用指令：

```bash
pnpm dev              # Express + Vite HMR (port 3001)
pnpm build            # Vite 前端 + esbuild 後端 → dist/
pnpm start            # 跑 production build
pnpm check            # TypeScript 檢查（不輸出）
pnpm format           # Prettier
pnpm test             # Vitest（server 端測試）
pnpm db:push          # drizzle-kit generate + migrate
pnpm set-admin        # 建立 / 重設管理員帳號
```

執行單一測試檔：

```bash
pnpm vitest run server/i18n.test.ts
```

---

## 環境變數

| 變數 | 必填 | 說明 |
|------|:---:|------|
| `DATABASE_URL` | ✅ | MySQL 8 / TiDB 連線字串 |
| `JWT_SECRET` | ✅ | JWT 簽章金鑰 |
| `OWNER_OPEN_ID` | ✅ | 預設 owner 帳號的 openId |
| `OWNER_NAME` | | 預設 owner 顯示名稱 |
| `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` | | 共用 bootstrap 登入 |
| `BUILT_IN_FORGE_*`, `VITE_*` | | AI 服務 / 前端公開設定 |

---

## 專案結構

```
server/_core/index.ts     Express 進入點
server/_core/trpc.ts      tRPC 初始化、procedure 工廠
server/_core/context.ts   tRPC request context（解析 JWT cookie）
server/_core/sdk.ts       authenticateRequest
server/routers.ts         所有 tRPC 路由（locale / project / key / translation / shared / user / stats / version）
server/db.ts              所有 Drizzle 查詢函式
drizzle/schema.ts         DB schema 與匯出的 TS 型別
shared/                   client / server 共用常數與型別

client/src/main.tsx       tRPC + React Query 初始化
client/src/App.tsx        Wouter 路由（/dashboard, /projects, /locales, /editor, /shared-keys, /history, /users）
client/src/pages/         頁面元件
client/src/components/ui/ shadcn/ui 元件
```

Path aliases（Vite & Vitest 同步）：`@/` → `client/src/`、`@shared/` → `shared/`、`@assets/` → `attached_assets/`。
