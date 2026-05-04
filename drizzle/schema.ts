import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "editor", "rd", "qa"]).default("rd").notNull(),
  /** Whether the account can sign in / be assigned new work. Disabled users keep their history but can't authenticate. */
  isActive: boolean("isActive").default(true).notNull(),
  /** Salted scrypt hash, format `salt:hash` (both hex). NULL = no local password (OAuth-only). */
  passwordHash: varchar("passwordHash", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Locales table
export const locales = mysqlTable("locales", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  name: varchar("name", { length: 64 }).notNull(),
  nativeName: varchar("nativeName", { length: 64 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Locale = typeof locales.$inferSelect;
export type InsertLocale = typeof locales.$inferInsert;

// Projects table (系統前端、遊戲前端、美術等)
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  /**
   * Optional whitelist of locale codes this project supports. Stored as a JSON
   * string array (e.g. `["zh-TW","en-US","ja-JP"]`). NULL or empty array means
   * "all active locales" — keeps backward compat for existing rows.
   */
  allowedLocaleCodes: text("allowedLocaleCodes"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_project_name").on(table.name),
]);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// Translation versions table (版本號管理)
export const translationVersions = mysqlTable("translation_versions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  versionNumber: varchar("versionNumber", { length: 64 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_version_project").on(table.projectId),
  index("idx_version_number").on(table.versionNumber),
]);

export type TranslationVersion = typeof translationVersions.$inferSelect;
export type InsertTranslationVersion = typeof translationVersions.$inferInsert;

// Translation keys table (supports nested structure via dot notation)
export const translationKeys = mysqlTable("translation_keys", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  keyPath: varchar("keyPath", { length: 512 }).notNull(),
  description: text("description"),
  tags: varchar("tags", { length: 256 }),
  isDeleted: boolean("isDeleted").default(false).notNull(),
  /** Persisted display order — smaller = closer to top. Default 0 so newly
   * created keys (untouched by the "依命名重排" action) tie with each other
   * and the client tiebreaks by createdAt DESC, putting the freshest at top. */
  sortOrder: int("sortOrder").default(0).notNull(),
  /**
   * Optional link to a shared_keys row. When set, the project's translations
   * for this key are *resolved from the shared dictionary* — edits flow through
   * the shared key, not the project's own `translations` rows. Set to NULL to
   * "detach" (一次性複製當前值至專案 translations 之後解除引用).
   *
   * Acts like Apifox 的 model $ref：shared key 內容變更，所有 link 到它的
   * project key 立即跟著變。
   */
  sharedKeyId: int("sharedKeyId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_key_path").on(table.keyPath),
  index("idx_project_key").on(table.projectId, table.keyPath),
  index("idx_is_deleted").on(table.isDeleted),
  index("idx_sort_order").on(table.sortOrder),
  index("idx_shared_key").on(table.sharedKeyId),
]);

export type TranslationKey = typeof translationKeys.$inferSelect;
export type InsertTranslationKey = typeof translationKeys.$inferInsert;

// Translations table (value per key per locale)
export const translations = mysqlTable("translations", {
  id: int("id").autoincrement().primaryKey(),
  keyId: int("keyId").notNull(),
  localeCode: varchar("localeCode", { length: 16 }).notNull(),
  value: text("value"),
  isTranslated: boolean("isTranslated").default(false).notNull(),
  versionId: int("versionId"),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_key_locale").on(table.keyId, table.localeCode),
  index("idx_locale_code").on(table.localeCode),
  index("idx_updated_by").on(table.updatedBy),
  index("idx_updated_at").on(table.updatedAt),
  index("idx_version_id").on(table.versionId),
]);

export type Translation = typeof translations.$inferSelect;
export type InsertTranslation = typeof translations.$inferInsert;

// Translation history table
export const translationHistory = mysqlTable("translation_history", {
  id: int("id").autoincrement().primaryKey(),
  keyId: int("keyId").notNull(),
  localeCode: varchar("localeCode", { length: 16 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  changedBy: int("changedBy").notNull(),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
  versionId: int("versionId"),
}, (table) => [
  index("idx_history_key").on(table.keyId),
  index("idx_history_locale").on(table.localeCode),
  index("idx_history_changed_by").on(table.changedBy),
  index("idx_history_changed_at").on(table.changedAt),
  index("idx_history_version").on(table.versionId),
]);

export type TranslationHistory = typeof translationHistory.$inferSelect;
export type InsertTranslationHistory = typeof translationHistory.$inferInsert;

// Translation snapshots table (整份版本快照：每次儲存到某版本時，把該專案目前所有 key×locale 的 value 整份寫入這裡)
export const translationSnapshots = mysqlTable("translation_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  versionId: int("versionId").notNull(),
  keyId: int("keyId").notNull(),
  localeCode: varchar("localeCode", { length: 16 }).notNull(),
  value: text("value"),
  isTranslated: boolean("isTranslated").default(false).notNull(),
  /** Whether this (keyId, localeCode) was actually changed in this version's save */
  wasChanged: boolean("wasChanged").default(false).notNull(),
  /** Original updatedBy / updatedAt at the moment of snapshot, copied from translations */
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt"),
  snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),
}, (table) => [
  index("idx_snapshot_version").on(table.versionId),
  index("idx_snapshot_version_key_locale").on(
    table.versionId,
    table.keyId,
    table.localeCode
  ),
]);

export type TranslationSnapshot = typeof translationSnapshots.$inferSelect;
export type InsertTranslationSnapshot = typeof translationSnapshots.$inferInsert;

// Translation exports table (記錄每次匯出的版本快照)
export const translationExports = mysqlTable("translation_exports", {
  id: int("id").autoincrement().primaryKey(),
  versionId: int("versionId").notNull(),
  projectId: int("projectId").notNull(),
  localeCode: varchar("localeCode", { length: 16 }).notNull(),
  jsonContent: text("jsonContent").notNull(),
  exportedBy: int("exportedBy").notNull(),
  exportedAt: timestamp("exportedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_export_version").on(table.versionId),
  index("idx_export_project").on(table.projectId),
]);

export type TranslationExport = typeof translationExports.$inferSelect;
export type InsertTranslationExport = typeof translationExports.$inferInsert;

// ─── Shared Keys (公版字典) ──────────────────────────────────────────────────
//
// 跨專案共用的 i18n 平面字典池。靈感來自 Apifox 的 schema/model，但不再有
// 「模板」這層分組 — 所有公版 key 直接以 keyPath 平面存放。
//   • sharedKeys              — 公版 key（與 translation_keys 結構同型，無 projectId）
//   • sharedTranslations      — 公版 key 的多語系值
//   • translation_keys.sharedKeyId — 專案 key 對 shared key 的「引用」連結
// ─────────────────────────────────────────────────────────────────────────────

export const sharedKeys = mysqlTable("shared_keys", {
  id: int("id").autoincrement().primaryKey(),
  /** 平面字典池 — keyPath 全域唯一 */
  keyPath: varchar("keyPath", { length: 512 }).notNull().unique(),
  description: text("description"),
  isDeleted: boolean("isDeleted").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_skey_path").on(table.keyPath),
  index("idx_skey_deleted").on(table.isDeleted),
]);

export type SharedKey = typeof sharedKeys.$inferSelect;
export type InsertSharedKey = typeof sharedKeys.$inferInsert;

export const sharedTranslations = mysqlTable("shared_translations", {
  id: int("id").autoincrement().primaryKey(),
  sharedKeyId: int("sharedKeyId").notNull(),
  localeCode: varchar("localeCode", { length: 16 }).notNull(),
  value: text("value"),
  isTranslated: boolean("isTranslated").default(false).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  // 必須是 UNIQUE，否則 onDuplicateKeyUpdate 不會觸發、會塞重複列
  uniqueIndex("uniq_str_key_locale").on(table.sharedKeyId, table.localeCode),
  index("idx_str_locale").on(table.localeCode),
]);

export type SharedTranslation = typeof sharedTranslations.$inferSelect;
export type InsertSharedTranslation = typeof sharedTranslations.$inferInsert;

// Shared translation history table — 與 translation_history 同型，但對應 shared key
export const sharedTranslationHistory = mysqlTable("shared_translation_history", {
  id: int("id").autoincrement().primaryKey(),
  sharedKeyId: int("sharedKeyId").notNull(),
  localeCode: varchar("localeCode", { length: 16 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  changedBy: int("changedBy").notNull(),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
}, (table) => [
  index("idx_shist_key").on(table.sharedKeyId),
  index("idx_shist_locale").on(table.localeCode),
  index("idx_shist_changed_by").on(table.changedBy),
  index("idx_shist_changed_at").on(table.changedAt),
]);

export type SharedTranslationHistory = typeof sharedTranslationHistory.$inferSelect;
export type InsertSharedTranslationHistory = typeof sharedTranslationHistory.$inferInsert;
