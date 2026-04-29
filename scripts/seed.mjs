import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

// Parse DATABASE_URL: mysql://user:pass@host:port/db
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/([^?]+)/);
if (!match) { console.error("Invalid DATABASE_URL"); process.exit(1); }

const [, user, password, host, port, database] = match;

const conn = await mysql.createConnection({
  host, port: port ? parseInt(port) : 3306, user, password, database,
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
});

console.log("🌱 Seeding database...");

// ─── Projects ────────────────────────────────────────────────────────────────
const projectData = [
  ["系統前端", "系統前端應用翻譯"],
  ["遊戲前端", "遊戲前端應用翻譯"],
  ["美術", "美術資源翻譯"],
];

for (const [name, description] of projectData) {
  await conn.execute(
    `INSERT IGNORE INTO projects (name, description) VALUES (?, ?)`,
    [name, description]
  );
}
console.log("✅ Projects seeded");

// ─── Locales ─────────────────────────────────────────────────────────────────
const localeData = [
  ["zh-TW", "Traditional Chinese", "繁體中文", 1],
  ["zh-CN", "Simplified Chinese",  "简体中文",  2],
  ["en",    "English",             "English",   3],
  ["ja",    "Japanese",            "日本語",     4],
  ["ko",    "Korean",              "한국어",     5],
];

for (const [code, name, nativeName, sortOrder] of localeData) {
  await conn.execute(
    `INSERT IGNORE INTO locales (code, name, nativeName, isActive, sortOrder) VALUES (?, ?, ?, 1, ?)`,
    [code, name, nativeName, sortOrder]
  );
}
console.log("✅ Locales seeded");

// ─── Translation Keys ─────────────────────────────────────────────────────────
const keys = [
  ["common.confirm",         "確認按鈕文字"],
  ["common.cancel",          "取消按鈕文字"],
  ["common.save",            "儲存按鈕文字"],
  ["common.delete",          "刪除按鈕文字"],
  ["common.edit",            "編輯按鈕文字"],
  ["common.search",          "搜尋輸入框佔位文字"],
  ["common.loading",         "載入中提示"],
  ["common.error",           "錯誤提示"],
  ["common.success",         "成功提示"],
  ["common.noData",          "無資料提示"],
  ["home.header.title",      "首頁標題"],
  ["home.header.subtitle",   "首頁副標題"],
  ["home.hero.cta",          "首頁主要行動按鈕"],
  ["home.hero.description",  "首頁英雄區塊描述文字"],
  ["home.features.title",    "功能特色區塊標題"],
  ["home.features.item1",    "功能特色項目一"],
  ["home.features.item2",    "功能特色項目二"],
  ["home.features.item3",    "功能特色項目三"],
  ["auth.login.title",       "登入頁面標題"],
  ["auth.login.email",       "電子郵件輸入框標籤"],
  ["auth.login.password",    "密碼輸入框標籤"],
  ["auth.login.submit",      "登入按鈕文字"],
  ["auth.login.forgotPw",    "忘記密碼連結文字"],
  ["auth.logout",            "登出按鈕文字"],
  ["auth.register.title",    "註冊頁面標題"],
  ["dashboard.title",        "儀表板頁面標題"],
  ["dashboard.welcome",      "儀表板歡迎訊息"],
  ["dashboard.stats.total",  "統計：總計"],
  ["dashboard.stats.active", "統計：活躍"],
  ["errors.notFound",        "404 頁面找不到"],
  ["errors.unauthorized",    "未授權存取"],
  ["errors.serverError",     "伺服器錯誤"],
  ["errors.networkError",    "網路連線錯誤"],
];

for (const [keyPath, description] of keys) {
  await conn.execute(
    `INSERT IGNORE INTO translation_keys (keyPath, description, isDeleted, createdBy) VALUES (?, ?, 0, 1)`,
    [keyPath, description]
  );
}
console.log(`✅ ${keys.length} translation keys seeded`);

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
  "common.confirm":         { "zh-TW": "確認", "zh-CN": "确认", "en": "Confirm", "ja": "確認", "ko": "확인" },
  "common.cancel":          { "zh-TW": "取消", "zh-CN": "取消", "en": "Cancel",  "ja": "キャンセル", "ko": "취소" },
  "common.save":            { "zh-TW": "儲存", "zh-CN": "保存", "en": "Save",    "ja": "保存", "ko": "저장" },
  "common.delete":          { "zh-TW": "刪除", "zh-CN": "删除", "en": "Delete",  "ja": "削除", "ko": "삭제" },
  "common.edit":            { "zh-TW": "編輯", "zh-CN": "编辑", "en": "Edit",    "ja": "編集", "ko": "편집" },
  "common.search":          { "zh-TW": "搜尋...", "zh-CN": "搜索...", "en": "Search...", "ja": "検索...", "ko": "검색..." },
  "common.loading":         { "zh-TW": "載入中...", "zh-CN": "加载中...", "en": "Loading...", "ja": "読み込み中...", "ko": "로딩 중..." },
  "common.error":           { "zh-TW": "發生錯誤", "zh-CN": "发生错误", "en": "An error occurred", "ja": "エラーが発生しました" },
  "common.success":         { "zh-TW": "操作成功", "zh-CN": "操作成功", "en": "Success", "ja": "成功" },
  "common.noData":          { "zh-TW": "暫無資料", "zh-CN": "暂无数据", "en": "No data available", "ja": "データなし" },
  "home.header.title":      { "zh-TW": "歡迎使用我們的服務", "zh-CN": "欢迎使用我们的服务", "en": "Welcome to Our Service" },
  "home.header.subtitle":   { "zh-TW": "打造更好的使用體驗", "zh-CN": "打造更好的使用体验", "en": "Building a Better Experience" },
  "home.hero.cta":          { "zh-TW": "立即開始", "zh-CN": "立即开始", "en": "Get Started", "ja": "始める", "ko": "시작하기" },
  "home.hero.description":  { "zh-TW": "探索我們的功能，提升您的工作效率。", "zh-CN": "探索我们的功能，提升您的工作效率。", "en": "Explore our features and boost your productivity." },
  "home.features.title":    { "zh-TW": "核心功能", "zh-CN": "核心功能", "en": "Core Features", "ja": "主な機能", "ko": "핵심 기능" },
  "home.features.item1":    { "zh-TW": "快速部署", "zh-CN": "快速部署", "en": "Fast Deployment", "ja": "高速デプロイ", "ko": "빠른 배포" },
  "home.features.item2":    { "zh-TW": "安全可靠", "zh-CN": "安全可靠", "en": "Secure & Reliable", "ja": "安全で信頼性が高い", "ko": "안전하고 신뢰할 수 있는" },
  "home.features.item3":    { "zh-TW": "彈性擴展", "zh-CN": "弹性扩展", "en": "Scalable", "ja": "スケーラブル", "ko": "확장 가능한" },
  "auth.login.title":       { "zh-TW": "登入帳號", "zh-CN": "登录账号", "en": "Sign In", "ja": "ログイン", "ko": "로그인" },
  "auth.login.email":       { "zh-TW": "電子郵件", "zh-CN": "电子邮件", "en": "Email", "ja": "メールアドレス", "ko": "이메일" },
  "auth.login.password":    { "zh-TW": "密碼", "zh-CN": "密码", "en": "Password", "ja": "パスワード", "ko": "비밀번호" },
  "auth.login.submit":      { "zh-TW": "登入", "zh-CN": "登录", "en": "Sign In", "ja": "ログイン", "ko": "로그인" },
  "auth.login.forgotPw":    { "zh-TW": "忘記密碼？", "zh-CN": "忘记密码？", "en": "Forgot password?" },
  "auth.logout":            { "zh-TW": "登出", "zh-CN": "退出登录", "en": "Sign Out", "ja": "ログアウト", "ko": "로그아웃" },
  "auth.register.title":    { "zh-TW": "建立帳號", "zh-CN": "创建账号", "en": "Create Account", "ja": "アカウント作成" },
  "dashboard.title":        { "zh-TW": "儀表板", "zh-CN": "仪表板", "en": "Dashboard", "ja": "ダッシュボード", "ko": "대시보드" },
  "dashboard.welcome":      { "zh-TW": "歡迎回來！", "zh-CN": "欢迎回来！", "en": "Welcome back!", "ja": "おかえりなさい！", "ko": "돌아오신 것을 환영합니다!" },
  "dashboard.stats.total":  { "zh-TW": "總計", "zh-CN": "总计", "en": "Total", "ja": "合計", "ko": "합계" },
  "dashboard.stats.active": { "zh-TW": "活躍", "zh-CN": "活跃", "en": "Active", "ja": "アクティブ", "ko": "활성" },
  "errors.notFound":        { "zh-TW": "找不到頁面", "zh-CN": "找不到页面", "en": "Page not found", "ja": "ページが見つかりません", "ko": "페이지를 찾을 수 없습니다" },
  "errors.unauthorized":    { "zh-TW": "未授權存取", "zh-CN": "未授权访问", "en": "Unauthorized access" },
  "errors.serverError":     { "zh-TW": "伺服器錯誤，請稍後再試", "zh-CN": "服务器错误，请稍后再试", "en": "Server error, please try again later" },
  "errors.networkError":    { "zh-TW": "網路連線錯誤", "zh-CN": "网络连接错误", "en": "Network connection error" },
};

// Get key IDs
const [keyRows] = await conn.execute(`SELECT id, keyPath FROM translation_keys`);

let translationCount = 0;
for (const keyRow of keyRows) {
  const { id: keyId, keyPath } = keyRow;
  const keyTranslations = translations[keyPath];
  if (!keyTranslations) continue;

  for (const [localeCode, value] of Object.entries(keyTranslations)) {
    await conn.execute(
      `INSERT INTO translations (keyId, localeCode, value, isTranslated, updatedBy)
       VALUES (?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE value = VALUES(value), isTranslated = 1`,
      [keyId, localeCode, value]
    );

    await conn.execute(
      `INSERT IGNORE INTO translation_history (keyId, localeCode, oldValue, newValue, changedBy, action)
       VALUES (?, ?, NULL, ?, 1, 'create')`,
      [keyId, localeCode, value]
    );
    translationCount++;
  }
}

console.log(`✅ ${translationCount} translations seeded`);

await conn.end();
console.log("🎉 Seed complete!");
process.exit(0);
