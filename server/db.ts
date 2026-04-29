import { eq, and, sql, asc, desc, inArray } from "drizzle-orm";
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
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(translationKeys).values(data);
  return Number((result as any).insertId ?? 0);
}

export async function updateTranslationKey(
  id: number,
  data: Partial<{
    keyPath: string;
    description: string;
    tags: string;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(translationKeys).set(data).where(eq(translationKeys.id, id));
}

export async function softDeleteTranslationKey(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(translationKeys)
    .set({ isDeleted: true })
    .where(eq(translationKeys.id, id));
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
  if (options?.localeCode)
    conditions.push(eq(translationHistory.localeCode, options.localeCode));
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
  localeCode?: string;
  changedBy?: number;
}) {
  const db = await getDb();
  if (!db) return 0;

  const conditions: any[] = [];
  if (options?.keyId) conditions.push(eq(translationHistory.keyId, options.keyId));
  if (options?.localeCode)
    conditions.push(eq(translationHistory.localeCode, options.localeCode));
  if (options?.changedBy)
    conditions.push(eq(translationHistory.changedBy, options.changedBy));

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
