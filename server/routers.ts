import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { translationHistory } from "../drizzle/schema";
import {
  createLocale,
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
  softDeleteTranslationKey,
  softDeleteTranslationKeys,
  updateKeySortOrders,
  updateLocale,
  updateTranslationKey,
  updateUserRole,
  upsertTranslation,
  upsertUser,
  getAllProjects,
  createProject,
  getVersionsByProject,
  createVersion,
  createExport,
  getDb,
  getTranslationsByKeyId,
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
      await createLocale({ ...input, isActive: true });
      return { success: true };
    }),
  update: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(64).optional(),
        nativeName: z.string().min(1).max(64).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateLocale(id, data);
      return { success: true };
    }),
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteLocale(input.id);
      return { success: true };
    }),
});

// ─── Project router ───────────────────────────────────────────────────────────
const projectRouter = router({
  list: protectedProcedure.query(() => getAllProjects()),
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
      const keyIds = keys.map((k) => k.id);
      const allTranslations = await getTranslationsByKeyIds(keyIds);

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
      await upsertTranslation({
        ...input,
        isTranslated: input.value.length > 0,
        updatedBy: ctx.user.id,
      });
      await createTranslationHistory({
        keyId: input.keyId,
        localeCode: input.localeCode,
        oldValue: null,
        newValue: input.value,
        changedBy: ctx.user.id,
        action: "update",
      });
      return { success: true };
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
      for (const update of input.updates) {
        await upsertTranslation({
          ...update,
          isTranslated: update.value.length > 0,
          updatedBy: ctx.user.id,
          versionId: input.versionId,
        });
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
      let projectKeyIds: number[] | undefined;
      if (input.projectId !== undefined) {
        const projectKeys = await getTranslationKeys({ projectId: input.projectId });
        projectKeyIds = projectKeys.map((k: any) => k.id);
        if (projectKeyIds.length === 0) return [];
      }
      return getTranslationHistory({
        keyId: input.keyId,
        keyIds: projectKeyIds,
        localeCode: input.localeCode,
        versionId: input.versionId,
        limit: input.limit,
        offset: input.offset,
      });
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
    localLogin: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ENV.localAuthUsername || !ENV.localAuthPassword) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "本地登入未設定" });
        }
        if (input.username !== ENV.localAuthUsername || input.password !== ENV.localAuthPassword) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "帳號或密碼錯誤" });
        }
        const openId = ENV.ownerOpenId || input.username;
        const name = ENV.ownerName || input.username;
        await upsertUser({ openId, name, email: null, loginMethod: "local", lastSignedIn: new Date() });
        const token = await sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
      }),
  }),
  locale: localeRouter,
  project: projectRouter,
  translationVersion: translationVersionRouter,
  translationKey: translationKeyRouter,
  translation: translationRouter,
  stats: statsRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
