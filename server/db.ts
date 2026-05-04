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
  sharedKeys,
  sharedTranslations,
  sharedTranslationHistory,
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
  sharedKeyId?: number | null;
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
    /** null = detach 引用；number = bind 至某條 sharedKey */
    sharedKeyId: number | null;
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

// ─── Shared Keys (共用字典) queries ──────────────────────────────────────────
//
// 跨專案共用的平面字典池。沒有「模板」這層分組 — 所有 shared key 直接平面儲存。
//   • sharedKeys              — 共用 key（與 translation_keys 結構同型，無 projectId）
//   • sharedTranslations      — 共用 key 的多語系值
//   • translation_keys.sharedKeyId — 專案 key 對 shared key 的「引用」連結
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared keys ─────────────────────────────────────────────────────────────

export async function getSharedKeys(options?: {
  search?: string;
  includeDeleted?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (!options?.includeDeleted) {
    conditions.push(eq(sharedKeys.isDeleted, false));
  }
  if (options?.search) {
    conditions.push(
      sql`${sharedKeys.keyPath} LIKE ${options.search + "%"}`
    );
  }
  const query = db.select().from(sharedKeys);
  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(asc(sharedKeys.keyPath));
  }
  return query.orderBy(asc(sharedKeys.keyPath));
}

export async function getSharedKeysByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(sharedKeys).where(inArray(sharedKeys.id, ids));
}

export async function createSharedKey(data: {
  keyPath: string;
  description?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(sharedKeys).values(data);
  return Number((result as any).insertId ?? 0);
}

export async function updateSharedKey(
  id: number,
  data: Partial<{ keyPath: string; description: string; sortOrder: number }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(sharedKeys).set(data).where(eq(sharedKeys.id, id));
}

/** Bulk update sortOrder on shared keys (used by 「依命名重排」). */
export async function updateSharedKeySortOrders(
  items: Array<{ id: number; sortOrder: number }>
) {
  const db = await getDb();
  if (!db || items.length === 0) return;
  for (const it of items) {
    await db
      .update(sharedKeys)
      .set({ sortOrder: it.sortOrder })
      .where(eq(sharedKeys.id, it.id));
  }
}

/**
 * Soft-delete a shared key. Also detaches any project translation_keys
 * that still pointed at this shared key — they keep their last seen value
 * by upserting it into the project's `translations` table before unlinking.
 *
 * Records a history row (action = "delete", localeCode = "*") so the audit
 * log can show the operation.
 */
export async function deleteSharedKey(id: number, changedBy: number) {
  const db = await getDb();
  if (!db) return;

  // 1) Take a snapshot of this shared key's current values per locale so we
  //    can persist them onto the linked project keys before detaching.
  const tValues = await db
    .select()
    .from(sharedTranslations)
    .where(eq(sharedTranslations.sharedKeyId, id));

  const linkedProjectKeys = await db
    .select({ id: translationKeys.id })
    .from(translationKeys)
    .where(eq(translationKeys.sharedKeyId, id));
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
      .set({ sharedKeyId: null })
      .where(inArray(translationKeys.id, projectKeyIds));
  }

  await db
    .update(sharedKeys)
    .set({ isDeleted: true })
    .where(eq(sharedKeys.id, id));

  // 寫一條 wildcard locale 的 delete 歷程，對齊 translationHistory 的慣例
  await db.insert(sharedTranslationHistory).values({
    sharedKeyId: id,
    localeCode: "*",
    oldValue: null,
    newValue: null,
    changedBy,
    action: "delete",
  });
}

// ── Shared translations ──────────────────────────────────────────────────────

export async function getSharedTranslationsByKeyIds(keyIds: number[]) {
  const db = await getDb();
  if (!db || keyIds.length === 0) return [];
  return db
    .select()
    .from(sharedTranslations)
    .where(inArray(sharedTranslations.sharedKeyId, keyIds));
}

export async function upsertSharedTranslation(data: {
  sharedKeyId: number;
  localeCode: string;
  value: string;
  isTranslated: boolean;
  updatedBy: number;
}) {
  const db = await getDb();
  if (!db) return;

  // 先取舊值寫入歷程
  const existing = await db
    .select()
    .from(sharedTranslations)
    .where(
      and(
        eq(sharedTranslations.sharedKeyId, data.sharedKeyId),
        eq(sharedTranslations.localeCode, data.localeCode)
      )
    )
    .limit(1);
  const oldValue = (existing as any[])[0]?.value ?? null;
  const isCreate = (existing as any[]).length === 0;

  await db
    .insert(sharedTranslations)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        value: data.value,
        isTranslated: data.isTranslated,
        updatedBy: data.updatedBy,
      },
    });

  // 只在值真的改變時記錄歷程
  if (isCreate || oldValue !== data.value) {
    await db.insert(sharedTranslationHistory).values({
      sharedKeyId: data.sharedKeyId,
      localeCode: data.localeCode,
      oldValue,
      newValue: data.value,
      changedBy: data.updatedBy,
      action: isCreate ? "create" : "update",
    });
  }
}

/**
 * Fetch shared translation history with pagination + optional filters.
 * 對應 getTranslationHistory 的形狀。
 */
export async function getSharedTranslationHistory(options?: {
  sharedKeyId?: number;
  localeCode?: string;
  changedBy?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (options?.sharedKeyId) {
    conditions.push(eq(sharedTranslationHistory.sharedKeyId, options.sharedKeyId));
  }
  if (options?.localeCode) {
    conditions.push(eq(sharedTranslationHistory.localeCode, options.localeCode));
  }
  if (options?.changedBy) {
    conditions.push(eq(sharedTranslationHistory.changedBy, options.changedBy));
  }
  let q: any = db.select().from(sharedTranslationHistory);
  if (conditions.length > 0) q = q.where(and(...conditions));
  q = q.orderBy(desc(sharedTranslationHistory.changedAt));
  if (options?.limit) q = q.limit(options.limit);
  if (options?.offset) q = q.offset(options.offset);
  return q;
}

export async function getSharedTranslationHistoryCount(options?: {
  sharedKeyId?: number;
  localeCode?: string;
  changedBy?: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const conditions: any[] = [];
  if (options?.sharedKeyId) {
    conditions.push(eq(sharedTranslationHistory.sharedKeyId, options.sharedKeyId));
  }
  if (options?.localeCode) {
    conditions.push(eq(sharedTranslationHistory.localeCode, options.localeCode));
  }
  if (options?.changedBy) {
    conditions.push(eq(sharedTranslationHistory.changedBy, options.changedBy));
  }
  let q: any = db
    .select({ count: sql<number>`count(*)` })
    .from(sharedTranslationHistory);
  if (conditions.length > 0) q = q.where(and(...conditions));
  const rows = await q;
  return Number((rows as any[])[0]?.count ?? 0);
}

// ── Project ↔ shared key glue ────────────────────────────────────────────────

/**
 * Bind an existing project translation_key to a shared key (Apifox 的 $ref
 * 同步模式：以後此 key 的多語系值會從 sharedTranslations 取得)。
 */
export async function linkProjectKeyToShared(
  projectKeyId: number,
  sharedKeyId: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(translationKeys)
    .set({ sharedKeyId })
    .where(eq(translationKeys.id, projectKeyId));
}

/**
 * Detach a project key from its shared key (複製當前 shared 值落地後解除 link)。
 * 與 deleteSharedKey 採同樣的「先快照，再解除」策略，確保 detach 後不會
 * 看起來「翻譯憑空消失」。
 */
export async function unlinkProjectKeyFromShared(projectKeyId: number) {
  const db = await getDb();
  if (!db) return;
  const row = await db
    .select({ sharedKeyId: translationKeys.sharedKeyId })
    .from(translationKeys)
    .where(eq(translationKeys.id, projectKeyId))
    .limit(1);
  const skid = (row as any[])[0]?.sharedKeyId as number | null | undefined;
  if (skid) {
    const tValues = await db
      .select()
      .from(sharedTranslations)
      .where(eq(sharedTranslations.sharedKeyId, skid));
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
    .set({ sharedKeyId: null })
    .where(eq(translationKeys.id, projectKeyId));
}

/**
 * Apply shared keys into a project — for each selected sharedKey:
 *   • mode = "reference": create a project key (or reuse if same keyPath) and
 *     bind sharedKeyId. Project values come from the shared key thereafter.
 *   • mode = "copy": create a project key (or reuse) without binding,
 *     and copy the shared key's current translations into the project's
 *     `translations` rows. Future changes to the shared key don't propagate.
 *
 * Returns counts so the UI can show a useful toast.
 */
export async function applySharedKeysToProject(input: {
  projectId: number;
  mode: "reference" | "copy";
  /** Optional subset of sharedKeyIds; if omitted, applies all active keys. */
  sharedKeyIds?: number[];
  createdBy: number;
}): Promise<{ created: number; reused: number; linked: number; copied: number }> {
  const db = await getDb();
  if (!db) return { created: 0, reused: 0, linked: 0, copied: 0 };

  // Pull selected shared keys (or all active if no ids given)
  const sKeysCond: any[] = [eq(sharedKeys.isDeleted, false)];
  if (input.sharedKeyIds && input.sharedKeyIds.length > 0) {
    sKeysCond.push(inArray(sharedKeys.id, input.sharedKeyIds));
  }
  const sKeys = await db
    .select()
    .from(sharedKeys)
    .where(and(...sKeysCond));

  if ((sKeys as any[]).length === 0) {
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

  // Pre-fetch shared translations for all selected keys at once
  const tValues = await getSharedTranslationsByKeyIds(
    (sKeys as any[]).map((k) => k.id as number)
  );
  const tValuesByKeyId = new Map<number, any[]>();
  for (const tv of tValues as any[]) {
    const arr = tValuesByKeyId.get(tv.sharedKeyId) ?? [];
    arr.push(tv);
    tValuesByKeyId.set(tv.sharedKeyId, arr);
  }

  for (const sk of sKeys as any[]) {
    let projectKeyId: number;
    if (existingByPath.has(sk.keyPath)) {
      projectKeyId = existingByPath.get(sk.keyPath)!;
      reused++;
    } else {
      projectKeyId = await createTranslationKey({
        projectId: input.projectId,
        keyPath: sk.keyPath,
        description: sk.description ?? undefined,
        createdBy: input.createdBy,
      });
      created++;
    }

    if (input.mode === "reference") {
      await linkProjectKeyToShared(projectKeyId, sk.id);
      linked++;
    } else {
      // copy mode — drop the shared key's current values into the project's
      // `translations` table (no link).
      const arr = tValuesByKeyId.get(sk.id) ?? [];
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
 * locale, reading from sharedTranslations when sharedKeyId is set and falling
 * back to the project's own translations row otherwise. Returns a flat array
 * shaped like `translations` (so the existing editor code keeps working). When
 * a key is shared-linked, an extra `fromShared: true` flag is set so the UI
 * can show the badge.
 */
export async function getResolvedTranslationsForProjectKeys(
  projectKeys: Array<{ id: number; sharedKeyId: number | null | undefined }>
): Promise<
  Array<{
    keyId: number;
    localeCode: string;
    value: string | null;
    isTranslated: boolean;
    updatedBy: number | null;
    updatedAt: Date | null;
    fromShared?: boolean;
  }>
> {
  if (projectKeys.length === 0) return [];
  const linkedKeys = projectKeys.filter((k) => !!k.sharedKeyId);
  const unlinkedKeys = projectKeys.filter((k) => !k.sharedKeyId);

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
    const sKeyIds = Array.from(
      new Set(linkedKeys.map((k) => k.sharedKeyId as number))
    );
    const sRows = await getSharedTranslationsByKeyIds(sKeyIds);
    const sRowsByKey = new Map<number, any[]>();
    for (const sr of sRows as any[]) {
      const arr = sRowsByKey.get(sr.sharedKeyId) ?? [];
      arr.push(sr);
      sRowsByKey.set(sr.sharedKeyId, arr);
    }
    for (const k of linkedKeys) {
      const arr = sRowsByKey.get(k.sharedKeyId as number) ?? [];
      for (const sr of arr) {
        out.push({
          keyId: k.id,
          localeCode: sr.localeCode,
          value: sr.value,
          isTranslated: !!sr.isTranslated,
          updatedBy: sr.updatedBy ?? null,
          updatedAt: sr.updatedAt ?? null,
          fromShared: true,
        });
      }
    }
  }
  return out;
}
