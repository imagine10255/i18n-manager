import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "editor", "rd", "qa"]).default("rd").notNull(),
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
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_key_path").on(table.keyPath),
  index("idx_project_key").on(table.projectId, table.keyPath),
  index("idx_is_deleted").on(table.isDeleted),
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
