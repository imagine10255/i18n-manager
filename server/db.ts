import { eq, and, or, sql, asc, desc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  locales,
  translationKeys,
  translations,
  translationHistory,
  translationSnapshots,
  projects,
  translationVersions,
  translationExports,
  templates,
  templateKeys,
  templateTranslations,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (user.isActive !== undefined) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    }
    if ((user as any).passwordHash !== undefined) {
      (values as any).passwordHash = (user as any).passwordHash;
      (updateSet as any).passwordHash = (user as any).passwordHash;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Locale queries ──────────────────────────────────────────────────────────
export async function getAllLocales() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(locales).orderBy(asc(locales.sortOrder));
}

export async function getActiveLocales() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(locales)
    .where(eq(locales.isActive, true))
    .orderBy(asc(locales.sortOrder));
}

export async function createLocale(data: {
  code: string;
  name: string;
  nativeName: string;
  isActive: boolean;
  sortOrder?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(locales).values(data);
}

export async function updateLocale(
  id: number,
  data: Partial<{
    name: string;
    nativeName: string;
    isActive: boolean;
    sortOrder: number;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(locales).set(data).where(eq(locales.id, id));
}

export async function deleteLocale(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(locales).where(eq(locales.id, id));
}

// ─── Project queries ─────────────────────────────────────────────────────────
export async function getAllProjects() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(projects)
    .where(eq(projects.isActive, true))
    .orderBy(asc(projects.name));
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function createProject(data: {
  name: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(projects).values(data);
  return Number((result as any).insertId ?? 0);
}

export async function updateProject(
  id: number,
  data: Partial<{
    name: string;
    description: string;
    isActive: boolean;
    /** JSON-encoded array of locale codes (e.g. `["zh-TW","en-US"]`); null = all */
    allowedLocaleCodes: string | null;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(projects).set(data).where(eq(projects.id, id));
}

// ─── Translation Version queries ──────────────────────────────────────────────
export async function getVersionsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(translationVersions)
    .where(eq(translationVersions.projectId, projectId))
    .orderBy(desc(translationVersions.createdAt));
}

export async function createVersion(data: {
  projectId: number;
  versionNumber: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(translationVersions).values(data);
  return Number((result as any).insertId ?? 0);
}

// ─── Translation Key queries ──────────────────────────────────────────────────
export async function getTranslationKeys(options?: {
  projectId?: number;
  search?: string;
  includeDeleted?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (!options?.includeDeleted) {
    conditions.push(eq(translationKeys.isDeleted, false));
  }
  if (options?.projectId) {
    conditions.push(eq(translationKeys.projectId, options.projectId));
  }
  if (options?.search) {
    conditions.push(
      sql`${translationKeys.keyPath} LIKE ${options.search + "%"}`
    );
  }

  const query = db.select().from(translationKeys);
  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(asc(translationKeys.keyPath));
  }
  return query.orderBy(asc(translationKeys.keyPath));
}

export async function createTranslationKey(data: {
  projectId: number;
  keyPath: string;
  description?: string;
  tags?: string;
  templateKeyId?: number | null;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(translationKeys).values(data);
  return Number((result as any).insertId ?? 0);
}

/** Bulk fetch keyPath records by id (for joining into history etc.) */
export async function getTranslationKeysByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db
    .select({ id: translationKeys.id, keyPath: translationKeys.keyPath })
    .from(translationKeys)
    .where(inArray(translationKeys.id, ids));
}

/** Bulk fetch users by id — returns { id, name } pairs only. */
export async function getUsersByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
}

/**
 * Bulk-create translation keys for a project. Skips keyPaths that already exist
 * (by re-selecting after the insert). Returns a `keyPath → id` mapping for
 * every input path — both newly created AND pre-existing — so callers can wire
 * up translations in a single batch follow-up.
 */
export async function createTranslationKeysBatch(input: {
  projectId: number;
  items: Array<{ keyPath: string; description?: string; tags?: string }>;
  createdBy: number;
}): Promise<Array<{ keyPath: string; id: number }>> {
  const db = await getDb();
  if (!db || input.items.length === 0) return [];

  const allPaths = input.items.map((i) => i.keyPath);

  // 1) Find which paths already exist for this project (de-dup before insert)
  const existing = await db
    .select({ id: translationKeys.id, keyPath: translationKeys.keyPath })
    .from(translationKeys)
    .where(
      and(
        eq(translationKeys.projectId, input.projectId),
        inArray(translationKeys.keyPath, allPaths)
      )
    );
  const existingPaths = new Set(existing.map((r: any) => r.keyPath));
  const newRows = input.items
    .filter((i) => !existingPaths.has(i.keyPath))
    .map((i) => ({
      projectId: input.projectId,
      keyPath: i.keyPath,
      description: i.description,
      tags: i.tags,
      createdBy: input.createdBy,
    }));

  // 2) Bulk insert the missing ones
  if (newRows.length > 0) {
    // Drizzle MySQL supports a single multi-row insert; chunk to be safe on
    // very large imports (mysql max_allowed_packet etc.)
    const CHUNK = 500;
    for (let i = 0; i < newRows.length; i += CHUNK) {
      await db.insert(translationKeys).values(newRows.slice(i, i + CHUNK));
    }
  }

  // 3) Re-select to fetch the ids for every requested path (new + existing)
  const all = await db
    .select({ id: translationKeys.id, keyPath: translationKeys.keyPath })
    .from(translationKeys)
    .where(
      and(
        eq(translationKeys.projectId, input.projectId),
        inArray(translationKeys.keyPath, allPaths)
      )
    );
  return all.map((r: any) => ({ keyPath: r.keyPath as string, id: r.id as number }));
}

export async function updateTranslationKey(
  id: number,
  data: Partial<{
    keyPath: string;
    description: string;
    tags: string;
    /** null = detach 引用；number = bind 至某條 templateKey */
    templateKeyId: number | null;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(translationKeys).set(data as any).where(eq(translationKeys.id, id));
}

export async function softDeleteTranslationKey(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(translationKeys)
    .set({ isDeleted: true })
    .where(eq(translationKeys.id, id));
}

/** Soft-delete many keys in a single statement. */
export async function softDeleteTranslationKeys(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db
    .update(translationKeys)
    .set({ isDeleted: true })
    .where(inArray(translationKeys.id, ids));
}

/**
 * Bulk-update translationKeys.sortOrder. Used by the "依命名重排" action.
 * `items` is a flat list of `{ id, sortOrder }`; we issue one UPDATE per row
 * (Drizzle MySQL doesn't have a one-shot "update many rows with different
 * values" helper; using a CASE WHEN expression is faster but harder to read,
 * so we keep this simple — a few hundred rows is fine).
 */
export async function updateKeySortOrders(
  items: Array<{ id: number; sortOrder: number }>
) {
  const db = await getDb();
  if (!db) return;
  for (const { id, sortOrder } of items) {
    await db
      .update(translationKeys)
      .set({ sortOrder })
      .where(eq(translationKeys.id, id));
  }
}

// ─── Translation queries ─────────────────────────────────────────────────────
export async function getTranslationsByKeyIds(keyIds: number[]) {
  const db = await getDb();
  if (!db) return [];
  if (keyIds.length === 0) return [];
  return db
    .select()
    .from(translations)
    .where(inArray(translations.keyId, keyIds));
}

export async function getTranslationsByKeyId(keyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(translations)
    .where(eq(translations.keyId, keyId));
}

export async function upsertTranslation(data: {
  keyId: number;
  localeCode: string;
  value: string;
  isTranslated: boolean;
  updatedBy: number;
  versionId?: number;
}) {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(translations)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        value: data.value,
        isTranslated: data.isTranslated,
        updatedBy: data.updatedBy,
        versionId: data.versionId,
        updatedAt: new Date(),
      },
    });
}

// ─── Translation History queries ─────────────────────────────────────────────
export async function createTranslationHistory(data: {
  keyId: number;
  localeCode: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: number;
  action: "create" | "update" | "delete";
  versionId?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(translationHistory).values(data);
}

export async function getTranslationHistory(options?: {
  keyId?: number;
  /** Restrict to a specific set of keyIds (e.g. all keys in a project). */
  keyIds?: number[];
  localeCode?: string;
  changedBy?: number;
  versionId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (options?.keyId) conditions.push(eq(translationHistory.keyId, options.keyId));
  if (options?.keyIds && options.keyIds.length > 0) {
    conditions.push(inArray(translationHistory.keyId, options.keyIds));
  }
  if (options?.localeCode) {
    // Delete records use "*" to denote a whole-key event — keep them visible
    // even when the user filters by a specific locale.
    conditions.push(
      or(
        eq(translationHistory.localeCode, options.localeCode),
        eq(translationHistory.localeCode, "*")
      )!
    );
  }
  if (options?.changedBy)
    conditions.push(eq(translationHistory.changedBy, options.changedBy));
  if (options?.versionId)
    conditions.push(eq(translationHistory.versionId, options.versionId));

  const conditions_final = conditions.length > 0 ? and(...conditions) : undefined;
  let query = db.select().from(translationHistory);
  if (conditions_final) {
    query = query.where(conditions_final) as any;
  }
  query = query.orderBy(desc(translationHistory.changedAt)) as any;
  if (options?.limit) {
    query = query.limit(options.limit) as any;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as any;
  }
  return query as any;
}

export async function getHistoryCount(options?: {
  keyId?: number;
  keyIds?: number[];
  localeCode?: string;
  changedBy?: number;
  versionId?: number;
}) {
  const db = await getDb();
  if (!db) return 0;

  const conditions: any[] = [];
  if (options?.keyId) conditions.push(eq(translationHistory.keyId, options.keyId));
  if (options?.keyIds && options.keyIds.length > 0) {
    conditions.push(inArray(translationHistory.keyId, options.keyIds));
  }
  if (options?.localeCode) {
    conditions.push(
      or(
        eq(translationHistory.localeCode, options.localeCode),
        eq(translationHistory.localeCode, "*")
      )!
    );
  }
  if (options?.changedBy)
    conditions.push(eq(translationHistory.changedBy, options.changedBy));
  if (options?.versionId)
    conditions.push(eq(translationHistory.versionId, options.versionId));

  const conditions_final = conditions.length > 0 ? and(...conditions) : undefined;
  let query = db.select({ count: sql<number>`COUNT(*)` }).from(translationHistory);
  if (conditions_final) {
    query = query.where(conditions_final) as any;
  }
  const result = await (query as any);
  return Number(result[0]?.count ?? 0);
}

// ─── Translation Stats queries ────────────────────────────────────────────────
export async function getTranslationStats(projectId: number) {
  const db = await getDb();
  if (!db) return {};

  const localeList = await getActiveLocales();
  const stats: Record<string, { total: number; translated: number }> = {};

  for (const locale of localeList) {
    const result = await db
      .select({
        total: sql<number>`COUNT(DISTINCT ${translations.keyId})`,
        translated: sql<number>`COUNT(CASE WHEN ${translations.isTranslated} = true THEN 1 END)`,
      })
      .from(translations)
      .innerJoin(translationKeys, eq(translations.keyId, translationKeys.id))
      .where(
        and(
          eq(translations.localeCode, locale.code),
          eq(translationKeys.projectId, projectId),
          eq(translationKeys.isDeleted, false)
        )
      );

    stats[locale.code] = {
      total: Number(result[0]?.total ?? 0),
      translated: Number(result[0]?.translated ?? 0),
    };
  }

  return stats;
}

// ─── Translation Export queries ───────────────────────────────────────────────
export async function createExport(data: {
  versionId: number;
  projectId: number;
  localeCode: string;
  jsonContent: string;
  exportedBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(translationExports).values(data);
  return Number((result as any).insertId ?? 0);
}

export async function getExportData(versionId: number, localeCode: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(translationExports)
    .where(
      and(
        eq(translationExports.versionId, versionId),
        eq(translationExports.localeCode, localeCode)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// ─── Translation snapshot queries ──────────────────────────────────────────
/**
 * Replace the entire snapshot for a given version with a fresh, full copy of
 * all (key, locale) pairs in the project. This is called from `batchUpdate`
 * after the changes have been applied to `translations`, so the snapshot
 * always represents the FULL state of the project at the moment of save.
 *
 * Caller passes `changedKeysSet` (a Set of `${keyId}:${localeCode}`) so we can
 * mark which rows were actually changed in this save (used to highlight diffs
 * in the UI and to power the "僅該版本 Key" filter).
 */
export async function replaceVersionSnapshot(input: {
  versionId: number;
  projectId: number;
  changedSet: Set<string>; // entries like `${keyId}:${localeCode}`
}) {
  const db = await getDb();
  if (!db) return;

  // 1) Pull every non-deleted key in the project
  const keys = await db
    .select({ id: translationKeys.id })
    .from(translationKeys)
    .where(
      and(
        eq(translationKeys.projectId, input.projectId),
        eq(translationKeys.isDeleted, false)
      )
    );
  const keyIds = keys.map((k: any) => k.id as number);
  if (keyIds.length === 0) {
    // Nothing to snapshot — clear any previous rows for this version
    await db
      .delete(translationSnapshots)
      .where(eq(translationSnapshots.versionId, input.versionId));
    return;
  }

  // 2) Pull current translations for those keys
  const allTranslations = await db
    .select()
    .from(translations)
    .where(inArray(translations.keyId, keyIds));

  // 3) Replace the entire snapshot for this versionId
  await db
    .delete(translationSnapshots)
    .where(eq(translationSnapshots.versionId, input.versionId));

  if (allTranslations.length === 0) return;

  const rows = allTranslations.map((t: any) => ({
    versionId: input.versionId,
    keyId: t.keyId as number,
    localeCode: t.localeCode as string,
    value: t.value as string | null,
    isTranslated: !!t.isTranslated,
    wasChanged: input.changedSet.has(`${t.keyId}:${t.localeCode}`),
    updatedBy: (t.updatedBy as number | null) ?? null,
    updatedAt: (t.updatedAt as Date | null) ?? null,
  }));

  // Bulk insert in chunks (avoid hitting MySQL packet limits for huge projects)
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(translationSnapshots).values(rows.slice(i, i + CHUNK));
  }
}

/** Read all snapshot rows for a given version. */
export async function getVersionSnapshot(versionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(translationSnapshots)
    .where(eq(translationSnapshots.versionId, versionId));
}

// ─── User queries ────────────────────────────────────────────────────────────
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(asc(users.name));
}

export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role: role as any }).where(eq(users.id, userId));
}

/** Generic user update — only the keys present in `data` are written. */
export async function updateUser(
  userId: number,
  data: Partial<{
    name: string;
    email: string | null;
    role: "admin" | "editor" | "rd" | "qa";
    isActive: boolean;
    passwordHash: string | null;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data as any).where(eq(users.id, userId));
}

/** Hard-delete a user (cascades nothing — history rows stay with their original userId). */
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}

// ─── Template (字典/模型) queries ─────────────────────────────────────────────
//
// 這一整段對應 Apifox 的 schema/model：跨專案共用的 i18n 「模型」。
//   • templates                 — 一個模板（一份 dictionary）
//   • templateKeys              — 模板內的 key（與 translation_keys 結構同型）
//   • templateTranslations      — 模板內 key 的多語系值
//   • translation_keys.templateKeyId — 專案 key 對模板 key 的「引用」連結
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(templates).orderBy(asc(templates.name));
}

export async function getTemplateById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(templates)
    .where(eq(templates.id, id))
    .limit(1);
  return (result as any[])[0] ?? null;
}

export async function createTemplate(data: {
  name: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(templates).values(data);
  return Number((result as any).insertId ?? 0);
}

export async function updateTemplate(
  id: number,
  data: Partial<{ name: string; description: string; isActive: boolean }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(templates).set(data).where(eq(templates.id, id));
}

export async function deleteTemplate(id: number) {
  const db = await getDb();
  if (!db) return;
  // Detach any project keys still referencing this template's keys before
  // deleting, to avoid dangling templateKeyId pointers in translation_keys.
  const keysOfTemplate = await db
    .select({ id: templateKeys.id })
    .from(templateKeys)
    .where(eq(templateKeys.templateId, id));
  const keyIds = (keysOfTemplate as any[]).map((r) => r.id as number);
  if (keyIds.length > 0) {
    await db
      .update(translationKeys)
      .set({ templateKeyId: null })
      .where(inArray(translationKeys.templateKeyId, keyIds));
    await db
      .delete(templateTranslations)
      .where(inArray(templateTranslations.templateKeyId, keyIds));
    await db.delete(templateKeys).where(eq(templateKeys.templateId, id));
  }
  await db.delete(templates).where(eq(templates.id, id));
}

// ── Template keys ───────────────────────────────────────────────────────────

export async function getTemplateKeys(options?: {
  templateId?: number;
  search?: string;
  includeDeleted?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (!options?.includeDeleted) {
    conditions.push(eq(templateKeys.isDeleted, false));
  }
  if (options?.templateId) {
    conditions.push(eq(templateKeys.templateId, options.templateId));
  }
  if (options?.search) {
    conditions.push(
      sql`${templateKeys.keyPath} LIKE ${options.search + "%"}`
    );
  }
  const query = db.select().from(templateKeys);
  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(asc(templateKeys.keyPath));
  }
  return query.orderBy(asc(templateKeys.keyPath));
}

export async function getTemplateKeysByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(templateKeys).where(inArray(templateKeys.id, ids));
}

export async function createTemplateKey(data: {
  templateId: number;
  keyPath: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(templateKeys).values(data);
  return Number((result as any).insertId ?? 0);
}

export async function updateTemplateKey(
  id: number,
  data: Partial<{ keyPath: string; description: string; sortOrder: number }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(templateKeys).set(data).where(eq(templateKeys.id, id));
}

/**
 * Soft-delete a template key. Also detaches any project translation_keys
 * that still pointed at this template key — they keep their last seen value
 * by upserting it into the project's `translations` table before unlinking.
 */
export async function deleteTemplateKey(id: number) {
  const db = await getDb();
  if (!db) return;

  // 1) Take a snapshot of this template key's current values per locale so we
  //    can persist them onto the linked project keys before detaching.
  const tValues = await db
    .select()
    .from(templateTranslations)
    .where(eq(templateTranslations.templateKeyId, id));

  const linkedProjectKeys = await db
    .select({ id: translationKeys.id })
    .from(translationKeys)
    .where(eq(translationKeys.templateKeyId, id));
  const projectKeyIds = (linkedProjectKeys as any[]).map((r) => r.id as number);

  if (projectKeyIds.length > 0 && (tValues as any[]).length > 0) {
    for (const pid of projectKeyIds) {
      for (const tv of tValues as any[]) {
        await db
          .insert(translations)
          .values({
            keyId: pid,
            localeCode: tv.localeCode,
            value: tv.value,
            isTranslated: !!tv.isTranslated,
            updatedBy: tv.updatedBy ?? null,
          })
          .onDuplicateKeyUpdate({
            set: {
              value: tv.value,
              isTranslated: !!tv.isTranslated,
              updatedBy: tv.updatedBy ?? null,
            },
          });
      }
    }
  }

  if (projectKeyIds.length > 0) {
    await db
      .update(translationKeys)
      .set({ templateKeyId: null })
      .where(inArray(translationKeys.id, projectKeyIds));
  }

  await db
    .update(templateKeys)
    .set({ isDeleted: true })
    .where(eq(templateKeys.id, id));
}

// ── Template translations ────────────────────────────────────────────────────

export async function getTemplateTranslationsByKeyIds(keyIds: number[]) {
  const db = await getDb();
  if (!db || keyIds.length === 0) return [];
  return db
    .select()
    .from(templateTranslations)
    .where(inArray(templateTranslations.templateKeyId, keyIds));
}

export async function upsertTemplateTranslation(data: {
  templateKeyId: number;
  localeCode: string;
  value: string;
  isTranslated: boolean;
  updatedBy: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(templateTranslations)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        value: data.value,
        isTranslated: data.isTranslated,
        updatedBy: data.updatedBy,
      },
    });
}

// ── Project ↔ template glue ──────────────────────────────────────────────────

/**
 * Bind an existing project translation_key to a template key (Apifox 的 $ref
 * 同步模式：以後此 key 的多語系值會從 templateTranslations 取得)。
 */
export async function linkProjectKeyToTemplate(
  projectKeyId: number,
  templateKeyId: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(translationKeys)
    .set({ templateKeyId })
    .where(eq(translationKeys.id, projectKeyId));
}

/**
 * Detach a project key from its template (複製當前模板值落地後解除 link)。
 * 與 deleteTemplateKey 採同樣的「先快照，再解除」策略，確保 detach 後不會
 * 看起來「翻譯憑空消失」。
 */
export async function unlinkProjectKeyFromTemplate(projectKeyId: number) {
  const db = await getDb();
  if (!db) return;
  const row = await db
    .select({ templateKeyId: translationKeys.templateKeyId })
    .from(translationKeys)
    .where(eq(translationKeys.id, projectKeyId))
    .limit(1);
  const tkid = (row as any[])[0]?.templateKeyId as number | null | undefined;
  if (tkid) {
    const tValues = await db
      .select()
      .from(templateTranslations)
      .where(eq(templateTranslations.templateKeyId, tkid));
    for (const tv of tValues as any[]) {
      await db
        .insert(translations)
        .values({
          keyId: projectKeyId,
          localeCode: tv.localeCode,
          value: tv.value,
          isTranslated: !!tv.isTranslated,
          updatedBy: tv.updatedBy ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            value: tv.value,
            isTranslated: !!tv.isTranslated,
            updatedBy: tv.updatedBy ?? null,
          },
        });
    }
  }
  await db
    .update(translationKeys)
    .set({ templateKeyId: null })
    .where(eq(translationKeys.id, projectKeyId));
}

/**
 * Apply a template into a project — for each templateKey:
 *   • mode = "reference": create a project key (or reuse if same keyPath) and
 *     bind templateKeyId. Project values come from the template thereafter.
 *   • mode = "copy": create a project key (or reuse) without binding,
 *     and copy the template's current translations into the project's
 *     `translations` rows. Future changes to the template don't propagate.
 *
 * Returns counts so the UI can show a useful toast.
 */
export async function applyTemplateToProject(input: {
  templateId: number;
  projectId: number;
  mode: "reference" | "copy";
  /** Optional subset of templateKeyIds; if omitted, applies all active keys. */
  templateKeyIds?: number[];
  createdBy: number;
}): Promise<{ created: number; reused: number; linked: number; copied: number }> {
  const db = await getDb();
  if (!db) return { created: 0, reused: 0, linked: 0, copied: 0 };

  // Pull the template's keys (filtered to selected ids if any)
  const tKeysCond: any[] = [
    eq(templateKeys.templateId, input.templateId),
    eq(templateKeys.isDeleted, false),
  ];
  if (input.templateKeyIds && input.templateKeyIds.length > 0) {
    tKeysCond.push(inArray(templateKeys.id, input.templateKeyIds));
  }
  const tKeys = await db
    .select()
    .from(templateKeys)
    .where(and(...tKeysCond));

  if ((tKeys as any[]).length === 0) {
    return { created: 0, reused: 0, linked: 0, copied: 0 };
  }

  // Existing project keys (alive only) — keyed by keyPath for reuse
  const existing = await db
    .select({ id: translationKeys.id, keyPath: translationKeys.keyPath })
    .from(translationKeys)
    .where(
      and(
        eq(translationKeys.projectId, input.projectId),
        eq(translationKeys.isDeleted, false)
      )
    );
  const existingByPath = new Map<string, number>();
  for (const e of existing as any[]) existingByPath.set(e.keyPath, e.id);

  let created = 0;
  let reused = 0;
  let linked = 0;
  let copied = 0;

  // Pre-fetch template translations for all selected keys at once
  const tValues = await getTemplateTranslationsByKeyIds(
    (tKeys as any[]).map((k) => k.id as number)
  );
  const tValuesByKeyId = new Map<number, any[]>();
  for (const tv of tValues as any[]) {
    const arr = tValuesByKeyId.get(tv.templateKeyId) ?? [];
    arr.push(tv);
    tValuesByKeyId.set(tv.templateKeyId, arr);
  }

  for (const tk of tKeys as any[]) {
    let projectKeyId: number;
    if (existingByPath.has(tk.keyPath)) {
      projectKeyId = existingByPath.get(tk.keyPath)!;
      reused++;
    } else {
      projectKeyId = await createTranslationKey({
        projectId: input.projectId,
        keyPath: tk.keyPath,
        description: tk.description ?? undefined,
        createdBy: input.createdBy,
      });
      created++;
    }

    if (input.mode === "reference") {
      await linkProjectKeyToTemplate(projectKeyId, tk.id);
      linked++;
    } else {
      // copy mode — drop the template's current values into the project's
      // `translations` table (no link).
      const arr = tValuesByKeyId.get(tk.id) ?? [];
      for (const tv of arr) {
        await db
          .insert(translations)
          .values({
            keyId: projectKeyId,
            localeCode: tv.localeCode,
            value: tv.value,
            isTranslated: !!tv.isTranslated,
            updatedBy: input.createdBy,
          })
          .onDuplicateKeyUpdate({
            set: {
              value: tv.value,
              isTranslated: !!tv.isTranslated,
              updatedBy: input.createdBy,
            },
          });
        copied++;
      }
    }
  }

  return { created, reused, linked, copied };
}

/**
 * Resolve a list of project translation keys to their *effective* values per
 * locale, reading from templateTranslations when templateKeyId is set and
 * falling back to the project's own translations row otherwise. Returns a
 * flat array shaped like `translations` (so the existing editor code keeps
 * working). When a key is template-linked, an extra `fromTemplate: true` flag
 * is set so the UI can show the badge.
 */
export async function getResolvedTranslationsForProjectKeys(
  projectKeys: Array<{ id: number; templateKeyId: number | null | undefined }>
): Promise<
  Array<{
    keyId: number;
    localeCode: string;
    value: string | null;
    isTranslated: boolean;
    updatedBy: number | null;
    updatedAt: Date | null;
    fromTemplate?: boolean;
  }>
> {
  if (projectKeys.length === 0) return [];
  const linkedKeys = projectKeys.filter((k) => !!k.templateKeyId);
  const unlinkedKeys = projectKeys.filter((k) => !k.templateKeyId);

  const ownRows = await getTranslationsByKeyIds(unlinkedKeys.map((k) => k.id));
  const out: Array<any> = (ownRows as any[]).map((r) => ({
    keyId: r.keyId,
    localeCode: r.localeCode,
    value: r.value,
    isTranslated: !!r.isTranslated,
    updatedBy: r.updatedBy ?? null,
    updatedAt: r.updatedAt ?? null,
  }));

  if (linkedKeys.length > 0) {
    const tKeyIds = Array.from(
      new Set(linkedKeys.map((k) => k.templateKeyId as number))
    );
    const tRows = await getTemplateTranslationsByKeyIds(tKeyIds);
    const tRowsByTKey = new Map<number, any[]>();
    for (const tr of tRows as any[]) {
      const arr = tRowsByTKey.get(tr.templateKeyId) ?? [];
      arr.push(tr);
      tRowsByTKey.set(tr.templateKeyId, arr);
    }
    for (const k of linkedKeys) {
      const arr = tRowsByTKey.get(k.templateKeyId as number) ?? [];
      for (const tr of arr) {
        out.push({
          keyId: k.id,
          localeCode: tr.localeCode,
          value: tr.value,
          isTranslated: !!tr.isTranslated,
          updatedBy: tr.updatedBy ?? null,
          updatedAt: tr.updatedAt ?? null,
          fromTemplate: true,
        });
      }
    }
  }
  return out;
}
