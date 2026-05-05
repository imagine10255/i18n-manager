import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { hashPassword, verifyPassword } from "./_core/password";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { translationHistory } from "../drizzle/schema";
import {
  createLocale,
  getLocaleByCode,
  renameLocaleCode,
  createTranslationHistory,
  createTranslationKey,
  deleteLocale,
  getActiveLocales,
  getAllLocales,
  getAllUsers,
  getExportData,
  getHistoryCount,
  getTranslationHistory,
  getTranslationKeys,
  getTranslationStats,
  getTranslationsByKeyIds,
  createTranslationKeysBatch,
  deleteUser,
  getProjectById,
  getTranslationKeysByIds,
  getUserByEmail,
  getUsersByIds,
  softDeleteTranslationKey,
  softDeleteTranslationKeys,
  updateKeySortOrders,
  updateProject,
  updateUser,
  updateLocale,
  updateTranslationKey,
  updateUserRole,
  upsertTranslation,
  upsertUser,
  getAllProjects,
  getAllProjectsIncludingInactive,
  createProject,
  getVersionsByProject,
  createVersion,
  createExport,
  getDb,
  getTranslationsByKeyId,
  // Shared key helpers
  getSharedKeys,
  getSharedKeysByIds,
  createSharedKey,
  updateSharedKey,
  updateSharedKeySortOrders,
  deleteSharedKey,
  getSharedTranslationsByKeyIds,
  upsertSharedTranslation,
  linkProjectKeyToShared,
  unlinkProjectKeyFromShared,
  applySharedKeysToProject,
  getResolvedTranslationsForProjectKeys,
  getSharedTranslationHistory,
  getSharedTranslationHistoryCount,
} from "./db";
import type { User } from "../drizzle/schema";

// ─── Role helpers ─────────────────────────────────────────────────────────────
function requireRole(user: User, ...roles: User["role"][]) {
  if (!roles.includes(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
  }
}

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireRole(ctx.user, "admin");
  return next({ ctx });
});

const editorProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireRole(ctx.user, "admin", "editor");
  return next({ ctx });
});

// ─── Locale router ────────────────────────────────────────────────────────────
const localeRouter = router({
  list: protectedProcedure.query(() => getAllLocales()),
  listActive: protectedProcedure.query(() => getActiveLocales()),
  create: adminProcedure
    .input(
      z.object({
        code: z.string().min(2).max(16),
        name: z.string().min(1).max(64),
        nativeName: z.string().min(1).max(64),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ input }) => {
      const dup = await getLocaleByCode(input.code);
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `語系代碼「${input.code}」已存在`,
        });
      }
      await createLocale({ ...input, isActive: true });
      return { success: true };
    }),
  update: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        code: z.string().min(2).max(16).optional(),
        name: z.string().min(1).max(64).optional(),
        nativeName: z.string().min(1).max(64).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, code, ...rest } = input;

      // 改 code 的話：先驗證 unique，然後 cascade 更新所有 reference 字串的表
      if (code !== undefined) {
        const all = await getAllLocales();
        const me = (all as any[]).find((l) => l.id === id);
        if (!me) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "找不到指定的語系",
          });
        }
        if (me.code !== code) {
          const dup = (all as any[]).find(
            (l) => l.code === code && l.id !== id
          );
          if (dup) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `語系代碼「${code}」已被其他語系使用`,
            });
          }
          await renameLocaleCode(id, me.code as string, code);
        }
      }

      // 其餘欄位
      if (Object.keys(rest).length > 0) {
        await updateLocale(id, rest);
      }
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteLocale(input.id);
      return { success: true };
    }),
  /** Bulk update sortOrder — used by drag-to-reorder on the locale manager. */
  updateSortOrders: adminProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.number().int(),
            sortOrder: z.number().int(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      for (const { id, sortOrder } of input.items) {
        await updateLocale(id, { sortOrder });
      }
      return { success: true, updated: input.items.length };
    }),
});

// ─── Project router ───────────────────────────────────────────────────────────
const projectRouter = router({
  list: protectedProcedure.query(() => getAllProjects()),
  /**
   * Admin-only：把所有專案撈出來（含已停用 / 軟刪除的），用在「專案管理」
   * 頁面上讓 admin 可以復原刪除過的專案。
   */
  listAll: adminProcedure.query(() => getAllProjectsIncludingInactive()),
  /** Read a single project by id (for the project-settings dialog). */
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ input }) => getProjectById(input.id)),
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await createProject({
        ...input,
        createdBy: ctx.user.id,
      });
      return { id };
    }),
  /**
   * Update project settings — including the per-project locale whitelist.
   * `allowedLocaleCodes`: pass `null` for "all active locales" (default).
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        allowedLocaleCodes: z.array(z.string()).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, allowedLocaleCodes, ...rest } = input;
      const data: any = { ...rest };
      if (allowedLocaleCodes !== undefined) {
        data.allowedLocaleCodes =
          allowedLocaleCodes === null || allowedLocaleCodes.length === 0
            ? null
            : JSON.stringify(allowedLocaleCodes);
      }
      await updateProject(id, data);
      return { success: true };
    }),
  /**
   * 軟刪除專案：把 isActive 設成 false，從 list 隱藏。底下所有 translationKeys /
   * translations / history / snapshots / exports / versions 全部保留 — 之後若
   * 想復原，admin 可以走 update 把 isActive 改回 true。
   *
   * 不做 hard delete 是因為：
   *   • 跨表級聯太深，且 history / snapshots 是審計資料、不該被一鍵抹除
   *   • 軟刪除已能滿足「從列表移除」的需求
   *   • 真的要清掉資料庫，請走 DB / SQL 直接清，比 API 更明確安全
   */
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "專案不存在",
        });
      }
      await updateProject(input.id, { isActive: false });
      return { success: true } as const;
    }),
  /**
   * 復原軟刪除：把 isActive 設回 true。底下的 keys / translations 本來就沒
   * 動過，所以復原後資料就回來了。
   */
  restore: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const project = await getProjectById(input.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "專案不存在",
        });
      }
      await updateProject(input.id, { isActive: true });
      return { success: true } as const;
    }),
});

// ─── Translation Version router ────────────────────────────────────────────────
const translationVersionRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ input }) => {
      return getVersionsByProject(input.projectId);
    }),
  create: editorProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        versionNumber: z.string().min(1).max(64),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await createVersion({
        ...input,
        createdBy: ctx.user.id,
      });
      return { id };
    }),
});

// ─── Translation Key router ───────────────────────────────────────────────────
const translationKeyRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        search: z.string().optional(),
        includeDeleted: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const keys = await getTranslationKeys({
        projectId: input.projectId,
        search: input.search,
        includeDeleted: input.includeDeleted,
      });
      return keys;
    }),
  listByProject: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return getTranslationKeys({
        projectId: input.projectId,
        search: input.search,
        includeDeleted: false,
      });
    }),
  listWithTranslations: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        search: z.string().optional(),
        localeCode: z.string().optional(),
        onlyUntranslated: z.boolean().default(false),
        versionId: z.number().int().optional(),
      })
    )
      .query(async ({ input }) => {
      const keys = await getTranslationKeys({
        projectId: input.projectId,
        search: input.search,
      });
      // Shared-key-aware translation resolution: keys with `sharedKeyId` set
      // pull their values from `shared_translations`, otherwise from the
      // project's own `translations` rows. Each cell carries `fromShared`
      // so the editor can show the 「公版」 badge.
      const allTranslations = await getResolvedTranslationsForProjectKeys(
        keys.map((k: any) => ({ id: k.id, sharedKeyId: k.sharedKeyId ?? null }))
      );

      // 收集該版本中有異動的 (keyId, localeCode) — 用於亮顯異動 cell
      // 注意：版本檢視預設「顯示全部 Key 的最新值」，只是把該版本內被動到的 cell 標亮。
      let changedInVersion = new Set<string>();
      if (input.versionId) {
        const db = await getDb();
        if (db) {
          const changes = await db
            .select({
              keyId: translationHistory.keyId,
              localeCode: translationHistory.localeCode,
            })
            .from(translationHistory)
            .where(eq(translationHistory.versionId, input.versionId));
          for (const row of changes as any[]) {
            changedInVersion.add(`${row.keyId}:${row.localeCode}`);
          }
        }
      }
      // 一律回傳全部 keys（不再依 versionId 過濾）— 由 client 用 changedInVersion 標記異動
      const filteredKeys = keys;

      type LocaleCell = {
        value: string | null;
        isTranslated: boolean;
        updatedAt?: Date | null;
        updatedBy?: number | null;
        /** True iff this (key, locale) was modified in the selected version. */
        changedInVersion?: boolean;
        /** True iff the value came from a referenced shared key (Apifox $ref). */
        fromShared?: boolean;
      };

      const result = filteredKeys.map((key) => {
        const localeValues: Record<string, LocaleCell> = {};
        const keyTranslations = allTranslations.filter((t) => t.keyId === key.id);
        // Always show the latest stored value (so users can compare full state)
        for (const t of keyTranslations) {
          localeValues[t.localeCode] = {
            value: t.value,
            isTranslated: t.isTranslated,
            updatedAt: (t as any).updatedAt ?? null,
            updatedBy: (t as any).updatedBy ?? null,
            changedInVersion: input.versionId
              ? changedInVersion.has(`${key.id}:${t.localeCode}`)
              : undefined,
            fromShared: (t as any).fromShared === true,
          };
        }
        return { ...key, translations: localeValues };
      });
      if (input.localeCode && input.onlyUntranslated) {
        return result.filter(
          (r) => !r.translations[input.localeCode!]?.isTranslated
        );
      }
      return result;
    }),
  create: editorProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        keyPath: z.string().min(1).max(512),
        description: z.string().optional(),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Reject duplicates inside the same project (ignoring soft-deleted rows).
      const existing = await getTranslationKeys({
        projectId: input.projectId,
      });
      if (
        (existing as any[]).some((k: any) => k.keyPath === input.keyPath)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Key「${input.keyPath}」已經存在於此專案`,
        });
      }
      const id = await createTranslationKey({
        ...input,
        createdBy: ctx.user.id,
      });
      return { id };
    }),
  update: editorProcedure
    .input(
      z.object({
        id: z.number().int(),
        keyPath: z.string().min(1).max(512).optional(),
        description: z.string().optional(),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateTranslationKey(id, data);
      return { success: true };
    }),
  delete: editorProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await softDeleteTranslationKey(input.id);
      await createTranslationHistory({
        keyId: input.id,
        localeCode: "*",
        oldValue: null,
        newValue: null,
        changedBy: ctx.user.id,
        action: "delete",
      });
      return { success: true };
    }),
  /**
   * Bulk soft-delete a list of keys (used when removing an entire folder /
   * group from the tree). Records one history entry per affected key.
   */
  batchDelete: editorProcedure
    .input(z.object({ ids: z.array(z.number().int()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await softDeleteTranslationKeys(input.ids);
      // History records — one per id, with the wildcard locale to indicate
      // "the whole key" (matches the existing single-delete convention).
      for (const id of input.ids) {
        await createTranslationHistory({
          keyId: id,
          localeCode: "*",
          oldValue: null,
          newValue: null,
          changedBy: ctx.user.id,
          action: "delete",
        });
      }
      return { success: true, deleted: input.ids.length };
    }),
  /**
   * Bulk-create keys for a project. Used by the import flow so we don't make
   * one HTTP round-trip per missing key. Returns the full keyPath→id mapping
   * (including pre-existing matches) so the caller can immediately wire up
   * translations in a single follow-up batchUpdate.
   */
  batchCreate: editorProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        items: z.array(
          z.object({
            keyPath: z.string().min(1).max(512),
            description: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const items = await createTranslationKeysBatch({
        projectId: input.projectId,
        items: input.items,
        createdBy: ctx.user.id,
      });
      return { items };
    }),
  updateSortOrders: editorProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.number().int(),
            sortOrder: z.number().int(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      await updateKeySortOrders(input.items);
      return { success: true, updated: input.items.length };
    }),
});

// ─── Translation router ───────────────────────────────────────────────────────
//
// Shared-key-aware write path: if the project key has `sharedKeyId` set, the
// edit is rerouted to upsertSharedTranslation — the project's own
// `translations` row would be ignored by resolution anyway, and the user's
// intent is "edit the value as displayed", which is the shared key's value.
async function getSharedKeyIdMap(keyIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (keyIds.length === 0) return out;
  const db = await getDb();
  if (!db) return out;
  const { translationKeys } = await import("../drizzle/schema");
  const rows = await db
    .select({ id: translationKeys.id, sharedKeyId: translationKeys.sharedKeyId })
    .from(translationKeys)
    .where(inArray(translationKeys.id, keyIds));
  for (const r of rows as any[]) out.set(r.id, r.sharedKeyId ?? null);
  return out;
}

const translationRouter = router({
  updateValue: editorProcedure
    .input(
      z.object({
        keyId: z.number().int(),
        localeCode: z.string().min(2).max(16),
        value: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sMap = await getSharedKeyIdMap([input.keyId]);
      const skid = sMap.get(input.keyId) ?? null;
      if (skid) {
        await upsertSharedTranslation({
          sharedKeyId: skid,
          localeCode: input.localeCode,
          value: input.value,
          isTranslated: input.value.length > 0,
          updatedBy: ctx.user.id,
        });
      } else {
        await upsertTranslation({
          ...input,
          isTranslated: input.value.length > 0,
          updatedBy: ctx.user.id,
        });
      }
      await createTranslationHistory({
        keyId: input.keyId,
        localeCode: input.localeCode,
        oldValue: null,
        newValue: input.value,
        changedBy: ctx.user.id,
        action: "update",
      });
      return { success: true, viaShared: !!skid };
    }),
  batchUpdate: editorProcedure
    .input(
      z.object({
        updates: z.array(
          z.object({
            keyId: z.number().int(),
            localeCode: z.string(),
            value: z.string(),
          })
        ),
        versionId: z.number().int().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sMap = await getSharedKeyIdMap(
        Array.from(new Set(input.updates.map((u) => u.keyId)))
      );
      for (const update of input.updates) {
        const skid = sMap.get(update.keyId) ?? null;
        if (skid) {
          await upsertSharedTranslation({
            sharedKeyId: skid,
            localeCode: update.localeCode,
            value: update.value,
            isTranslated: update.value.length > 0,
            updatedBy: ctx.user.id,
          });
        } else {
          await upsertTranslation({
            ...update,
            isTranslated: update.value.length > 0,
            updatedBy: ctx.user.id,
            versionId: input.versionId,
          });
        }
        await createTranslationHistory({
          keyId: update.keyId,
          localeCode: update.localeCode,
          oldValue: null,
          newValue: update.value,
          changedBy: ctx.user.id,
          action: "update",
          versionId: input.versionId,
        });
      }
      return { success: true };
    }),
  exportJson: protectedProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        localeCode: z.string(),
        versionId: z.number().int(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const keys = await getTranslationKeys({ projectId: input.projectId });
      const result: Record<string, any> = {};

      for (const key of keys) {
        const translations = await getTranslationsByKeyId(key.id);
        const trans = translations.find((t) => t.localeCode === input.localeCode);
        if (trans?.value) {
          const parts = key.keyPath.split(".");
          let current = result;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
              current[parts[i]] = {};
            }
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = trans.value;
        }
      }

      const jsonContent = JSON.stringify(result, null, 2);
      await createExport({
        versionId: input.versionId,
        projectId: input.projectId,
        localeCode: input.localeCode,
        jsonContent,
        exportedBy: ctx.user.id,
      });

      return { jsonContent };
    }),
  getHistory: protectedProcedure
    .input(
      z.object({
        keyId: z.number().int().optional(),
        projectId: z.number().int().optional(),
        localeCode: z.string().optional(),
        versionId: z.number().int().optional(),
        limit: z.number().int().default(50),
        offset: z.number().int().default(0),
      })
    )
    .query(async ({ input }) => {
      // When filtering by project, first translate that into a list of key ids
      // (no projectId column on translation_history) and pass it down.
      // IMPORTANT: include soft-deleted keys — otherwise the very "delete"
      // history record we want to show would be filtered out.
      let projectKeyIds: number[] | undefined;
      if (input.projectId !== undefined) {
        const projectKeys = await getTranslationKeys({
          projectId: input.projectId,
          includeDeleted: true,
        });
        projectKeyIds = projectKeys.map((k: any) => k.id);
        if (projectKeyIds.length === 0) return { items: [], total: 0 };
      }
      const [rawItems, total] = await Promise.all([
        getTranslationHistory({
          keyId: input.keyId,
          keyIds: projectKeyIds,
          localeCode: input.localeCode,
          versionId: input.versionId,
          limit: input.limit,
          offset: input.offset,
        }),
        getHistoryCount({
          keyId: input.keyId,
          keyIds: projectKeyIds,
          localeCode: input.localeCode,
          versionId: input.versionId,
        }),
      ]);

      // Enrich with keyPath + changerName so the client doesn't need a separate join.
      const items = (rawItems as any[]).slice();
      if (items.length > 0) {
        const keyIdSet = Array.from(
          new Set(items.map((r: any) => r.keyId as number))
        );
        const userIdSet = Array.from(
          new Set(items.map((r: any) => r.changedBy as number).filter((n: any) => n != null))
        );
        const [keys, users] = await Promise.all([
          getTranslationKeysByIds(keyIdSet),
          getUsersByIds(userIdSet),
        ]);
        const keyMap = new Map<number, string>();
        for (const k of keys as any[]) keyMap.set(k.id, k.keyPath);
        const userMap = new Map<number, string>();
        for (const u of users as any[]) userMap.set(u.id, u.name ?? "");
        for (const item of items) {
          (item as any).keyPath = keyMap.get(item.keyId) ?? null;
          (item as any).changerName = userMap.get(item.changedBy) ?? null;
        }
      }

      return { items, total };
    }),
});

// ─── Stats router ─────────────────────────────────────────────────────────────
const statsRouter = router({
  getProjectStats: protectedProcedure
    .input(z.object({ projectId: z.number().int() }))
    .query(async ({ input }) => {
      return getTranslationStats(input.projectId);
    }),
});

// ─── User router ──────────────────────────────────────────────────────────────
const userRouter = router({
  list: adminProcedure.query(() => getAllUsers()),
  /**
   * Lightweight directory of users (id + name only) — used to show "last
   * modified by" in the translation editor. Available to any authenticated
   * user since the editor needs it to attribute changes to a person.
   */
  listBasic: protectedProcedure.query(async () => {
    const all = await getAllUsers();
    return (all as any[]).map((u) => ({
      id: u.id,
      name: u.name ?? "",
    }));
  }),
  /**
   * Manually create a user record (admin only). Useful for pre-assigning a
   * role before the person logs in via OAuth, or for fully local accounts.
   * Generates a `manual:{nanoid}` openId so the unique constraint is happy.
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(128),
        // Email is required for local login (it's the username).
        email: z.string().trim().email(),
        role: z.enum(["admin", "editor", "rd", "qa"]).default("rd"),
        password: z.string().min(6).max(128).optional().or(z.literal("")),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      // Reject duplicate email — it's the login key, must be unique.
      const dup = await getUserByEmail(input.email);
      if (dup) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Email「${input.email}」已被使用`,
        });
      }
      const openId = `manual:${nanoid(16)}`;
      const passwordHash = input.password
        ? await hashPassword(input.password)
        : null;
      await upsertUser({
        openId,
        name: input.name,
        email: input.email,
        loginMethod: "manual",
        role: input.role,
        isActive: input.isActive,
        passwordHash,
        lastSignedIn: new Date(),
      });
      return { success: true, openId };
    }),
  updateRole: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        role: z.enum(["admin", "editor", "rd", "qa"]),
      })
    )
    .mutation(async ({ input }) => {
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),
  /**
   * General-purpose user update. Empty / undefined password leaves the
   * existing hash untouched; a non-empty password is re-hashed and replaces
   * whatever was there.
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().trim().min(1).max(128).optional(),
        email: z.string().trim().email().optional(),
        role: z.enum(["admin", "editor", "rd", "qa"]).optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(6).max(128).optional().or(z.literal("")),
      })
    )
    .mutation(async ({ input }) => {
      const { id, password, email, ...rest } = input;
      // If email is changing, check it isn't already taken by another user.
      if (email !== undefined) {
        const existing = await getUserByEmail(email);
        if (existing && existing.id !== id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Email「${email}」已被其他使用者佔用`,
          });
        }
      }
      const data: any = { ...rest };
      if (email !== undefined) data.email = email;
      if (password) {
        data.passwordHash = await hashPassword(password);
      }
      await updateUser(id, data);
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能刪除自己的帳號",
        });
      }
      await deleteUser(input.id);
      return { success: true };
    }),
  /**
   * Self-service password change. Available to any authenticated user.
   * Requires the user's current password (or, for users who have never set
   * one, an empty currentPassword is accepted on the first set).
   */
  changeOwnPassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().max(128),
        newPassword: z.string().min(6).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const me = ctx.user as any;
      if (me.passwordHash) {
        const ok = await verifyPassword(input.currentPassword, me.passwordHash);
        if (!ok) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "目前的密碼錯誤",
          });
        }
      }
      const newHash = await hashPassword(input.newPassword);
      await updateUser(me.id, { passwordHash: newHash });
      return { success: true };
    }),
});

// ─── Shared Key (公版字典) router ─────────────────────────────────────────────
//
// 跨專案共用的 i18n 詞條池（平面字典）。對 shared key 的編輯會即時反映到所有
// reference 過它的 project key (因為 listWithTranslations 會以 sharedKeyId
// resolve 出值)。專案 key 也可選擇 `mode: "copy"` 一次性複製當前值，後續獨立
// 維護。
const sharedKeyRouter = router({
  // ── Shared keys ───────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => getSharedKeys({ search: input?.search })),

  /**
   * Flat 列出所有公版 keys + 多語系值。給專案編輯器的「引用公版 key」popover
   * 用，使用者挑 key 時可以直接看到目前公版各語系的值，比較好對照。
   * 資料量通常很小（<幾百筆），不需要分頁。
   */
  listAllFlat: protectedProcedure.query(async () => {
    const all = await getSharedKeys({});
    const keyIds = (all as any[]).map((k) => k.id as number);
    const trs = await getSharedTranslationsByKeyIds(keyIds);
    const byKey = new Map<number, Record<string, string>>();
    for (const t of trs as any[]) {
      const m = byKey.get(t.sharedKeyId) ?? {};
      m[t.localeCode] = t.value ?? "";
      byKey.set(t.sharedKeyId, m);
    }
    return (all as any[]).map((k) => ({
      keyId: k.id,
      keyPath: k.keyPath,
      description: k.description ?? null,
      translations: byKey.get(k.id) ?? {},
    }));
  }),

  /** 公版 key + 多語系值，整理成跟 translationKey.listWithTranslations 一致的形狀。 */
  listWithTranslations: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const keys = await getSharedKeys({ search: input?.search });
      const keyIds = (keys as any[]).map((k) => k.id as number);
      const trs = await getSharedTranslationsByKeyIds(keyIds);
      type Cell = {
        value: string | null;
        isTranslated: boolean;
        updatedAt?: Date | null;
        updatedBy?: number | null;
      };
      return (keys as any[]).map((k) => {
        const cells: Record<string, Cell> = {};
        for (const t of (trs as any[]).filter((x) => x.sharedKeyId === k.id)) {
          cells[t.localeCode] = {
            value: t.value,
            isTranslated: !!t.isTranslated,
            updatedAt: t.updatedAt ?? null,
            updatedBy: t.updatedBy ?? null,
          };
        }
        return { ...k, translations: cells };
      });
    }),

  create: editorProcedure
    .input(
      z.object({
        keyPath: z.string().min(1).max(512),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getSharedKeys({});
      if ((existing as any[]).some((k: any) => k.keyPath === input.keyPath)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `公版 key「${input.keyPath}」已存在`,
        });
      }
      const id = await createSharedKey({ ...input, createdBy: ctx.user.id });
      return { id };
    }),
  update: editorProcedure
    .input(
      z.object({
        id: z.number().int(),
        keyPath: z.string().min(1).max(512).optional(),
        description: z.string().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateSharedKey(id, data);
      return { success: true };
    }),
  delete: editorProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await deleteSharedKey(input.id, ctx.user.id);
      return { success: true };
    }),
  updateSortOrders: editorProcedure
    .input(
      z.object({
        items: z.array(
          z.object({ id: z.number().int(), sortOrder: z.number().int() })
        ),
      })
    )
    .mutation(async ({ input }) => {
      await updateSharedKeySortOrders(input.items);
      return { success: true, updated: input.items.length };
    }),

  // ── Shared translation values ─────────────────────────────────────────────
  /** Update a single value on a shared key — propagates to all references. */
  upsertValue: editorProcedure
    .input(
      z.object({
        sharedKeyId: z.number().int(),
        localeCode: z.string().min(2).max(16),
        value: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await upsertSharedTranslation({
        ...input,
        isTranslated: input.value.length > 0,
        updatedBy: ctx.user.id,
      });
      return { success: true };
    }),
  /** Batch upsert shared values (mirrors translation.batchUpdate). */
  batchUpsertValues: editorProcedure
    .input(
      z.object({
        updates: z.array(
          z.object({
            sharedKeyId: z.number().int(),
            localeCode: z.string().min(2).max(16),
            value: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      for (const u of input.updates) {
        await upsertSharedTranslation({
          ...u,
          isTranslated: u.value.length > 0,
          updatedBy: ctx.user.id,
        });
      }
      return { success: true, updated: input.updates.length };
    }),

  // ── Project ↔ shared key glue ─────────────────────────────────────────────
  /** Bind a project key to a shared key (sync mode). */
  linkProjectKey: editorProcedure
    .input(
      z.object({
        projectKeyId: z.number().int(),
        sharedKeyId: z.number().int(),
      })
    )
    .mutation(async ({ input }) => {
      await linkProjectKeyToShared(input.projectKeyId, input.sharedKeyId);
      return { success: true };
    }),
  /** Detach a project key from its shared key (一次性落地當前值)。 */
  unlinkProjectKey: editorProcedure
    .input(z.object({ projectKeyId: z.number().int() }))
    .mutation(async ({ input }) => {
      await unlinkProjectKeyFromShared(input.projectKeyId);
      return { success: true };
    }),
  /**
   * Apply selected shared keys into a project. `mode: "reference"` 採同步模式，
   * `mode: "copy"` 採一次性複製模式（之後獨立維護）。
   */
  applyToProject: editorProcedure
    .input(
      z.object({
        projectId: z.number().int(),
        mode: z.enum(["reference", "copy"]).default("reference"),
        sharedKeyIds: z.array(z.number().int()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const stats = await applySharedKeysToProject({
        projectId: input.projectId,
        mode: input.mode,
        sharedKeyIds: input.sharedKeyIds,
        createdBy: ctx.user.id,
      });
      return { success: true, ...stats };
    }),

  // ── History (對齊 translationKey.getHistory 的形狀) ────────────────────────
  getHistory: protectedProcedure
    .input(
      z.object({
        sharedKeyId: z.number().int().optional(),
        localeCode: z.string().optional(),
        limit: z.number().int().default(50),
        offset: z.number().int().default(0),
      })
    )
    .query(async ({ input }) => {
      const [rawItems, total] = await Promise.all([
        getSharedTranslationHistory({
          sharedKeyId: input.sharedKeyId,
          localeCode: input.localeCode,
          limit: input.limit,
          offset: input.offset,
        }),
        getSharedTranslationHistoryCount({
          sharedKeyId: input.sharedKeyId,
          localeCode: input.localeCode,
        }),
      ]);

      const items = (rawItems as any[]).slice();
      if (items.length > 0) {
        const keyIdSet = Array.from(
          new Set(items.map((r: any) => r.sharedKeyId as number))
        );
        const userIdSet = Array.from(
          new Set(
            items
              .map((r: any) => r.changedBy as number)
              .filter((n: any) => n != null)
          )
        );
        const [keys, users] = await Promise.all([
          getSharedKeysByIds(keyIdSet),
          getUsersByIds(userIdSet),
        ]);
        const keyMap = new Map<number, string>();
        for (const k of keys as any[]) keyMap.set(k.id, k.keyPath);
        const userMap = new Map<number, string>();
        for (const u of users as any[]) userMap.set(u.id, u.name ?? "");
        for (const item of items) {
          (item as any).keyPath = keyMap.get(item.sharedKeyId) ?? null;
          (item as any).changerName = userMap.get(item.changedBy) ?? null;
        }
      }

      return { items, total };
    }),
});

// ─── Main app router ──────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    /**
     * Local sign-in by email + password. Looks up the user record by email,
     * verifies their stored scrypt hash, refuses if the account is disabled.
     *
     * Falls back to the legacy ENV-based shared credential when an admin
     * hasn't created any local users yet (so first-run install still works).
     */
    localLogin: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email(),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByEmail(input.email);

        if (user && user.passwordHash) {
          if (!user.isActive) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "此帳號已停用，請聯絡管理員",
            });
          }
          const ok = await verifyPassword(input.password, user.passwordHash);
          if (!ok) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Email 或密碼錯誤",
            });
          }
          // Refresh lastSignedIn (upsertUser handles "row exists" path).
          await upsertUser({
            openId: user.openId,
            lastSignedIn: new Date(),
          });
          const token = await sdk.createSessionToken(user.openId, {
            name: user.name ?? input.email,
            expiresInMs: ONE_YEAR_MS,
          });
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, {
            ...cookieOptions,
            maxAge: ONE_YEAR_MS,
          });
          return { success: true } as const;
        }

        // Bootstrap fallback: no DB user with that email + password set →
        // fall through to the ENV-configured single shared credential.
        //
        // 這條路徑同時涵蓋兩種情境：
        //   (1) 完全沒有 admin row（首次安裝），透過 OWNER_OPEN_ID 建一筆。
        //   (2) admin row 已存在但 email / passwordHash 是空的（舊 OAuth 帳號），
        //       upsertUser 以 openId 為 key，會把 email + passwordHash 補寫進去。
        //
        // 補寫 passwordHash 之後，下次登入就會走上面的標準 email + password
        // 驗證路徑，不再依賴 ENV.LOCAL_AUTH_*。等於這條 fallback 是「一次性
        // 的 boot 引信」，不是長期登入機制。
        if (
          ENV.localAuthUsername &&
          ENV.localAuthPassword &&
          input.email === ENV.localAuthUsername &&
          input.password === ENV.localAuthPassword
        ) {
          const openId = ENV.ownerOpenId || input.email;
          const name = ENV.ownerName || input.email;
          // 也把 passwordHash 寫進去，這樣未來的登入可以走標準路徑，
          // 不必每次都比對 ENV.LOCAL_AUTH_*。
          const passwordHash = await hashPassword(input.password);
          await upsertUser({
            openId,
            name,
            email: input.email,
            loginMethod: "local",
            role: "admin",
            isActive: true,
            passwordHash,
            lastSignedIn: new Date(),
          });
          const token = await sdk.createSessionToken(openId, {
            name,
            expiresInMs: ONE_YEAR_MS,
          });
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, {
            ...cookieOptions,
            maxAge: ONE_YEAR_MS,
          });
          return { success: true } as const;
        }

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Email 或密碼錯誤",
        });
      }),
  }),
  locale: localeRouter,
  project: projectRouter,
  translationVersion: translationVersionRouter,
  translationKey: translationKeyRouter,
  translation: translationRouter,
  sharedKey: sharedKeyRouter,
  stats: statsRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
