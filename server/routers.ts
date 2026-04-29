import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
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
  softDeleteTranslationKey,
  updateLocale,
  updateTranslationKey,
  updateUserRole,
  upsertTranslation,
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

      // 如果指定了版本，只返回該版本中有異動的 Key
      let filteredKeys = keys;
      if (input.versionId) {
        const db = await getDb();
        if (db) {
          const changedKeyIds = await db
            .selectDistinct({ keyId: translationHistory.keyId })
            .from(translationHistory)
            .where(eq(translationHistory.versionId, input.versionId));
          const changedKeyIdSet = new Set(changedKeyIds.map((row: any) => row.keyId));
          filteredKeys = keys.filter((k) => changedKeyIdSet.has(k.id));
        }
      }

      // 如果指定了版本，需要從 translationHistory 表重建翻譯快照
      let versionTranslations: Record<number, Record<string, { value: string | null; isTranslated: boolean }>> = {};
      if (input.versionId) {
        const db = await getDb();
        if (db) {
          // 查詢該版本中每個 Key 的最新翻譯記錄
          const historyRecords = await db
            .select()
            .from(translationHistory)
            .where(eq(translationHistory.versionId, input.versionId));
          
          // 構建版本快照：每個 Key 的最新翻譯值
          const latestByKeyAndLocale: Record<number, Record<string, any>> = {};
          for (const record of historyRecords) {
            if (!latestByKeyAndLocale[record.keyId]) {
              latestByKeyAndLocale[record.keyId] = {};
            }
            // 使用最新的值（後来的記錄會覆蓋前面的）
            latestByKeyAndLocale[record.keyId][record.localeCode] = {
              value: record.newValue,
              isTranslated: record.newValue !== null && record.newValue !== '',
            };
          }
          versionTranslations = latestByKeyAndLocale;
        }
      }

      const result = filteredKeys.map((key) => {
        const localeValues: Record<string, { value: string | null; isTranslated: boolean }> = {};
        const keyTranslations = allTranslations.filter((t) => t.keyId === key.id);
        
        if (input.versionId) {
          // 使用版本快照中的翻譯
          if (versionTranslations[key.id]) {
            Object.assign(localeValues, versionTranslations[key.id]);
          }
        } else {
          // 未指定版本，顯示最新翻譯
          for (const t of keyTranslations) {
            localeValues[t.localeCode] = { value: t.value, isTranslated: t.isTranslated };
          }
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
        localeCode: z.string().optional(),
        versionId: z.number().int().optional(),
        limit: z.number().int().default(50),
        offset: z.number().int().default(0),
      })
    )
    .query(async ({ input }) => {
      return getTranslationHistory({
        keyId: input.keyId,
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
      return {
        success: true,
      } as const;
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
