# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Express + Vite HMR) on port 3001
pnpm build        # Build frontend (Vite) + backend (esbuild) to dist/
pnpm start        # Run production build
pnpm check        # TypeScript type check (no emit)
pnpm format       # Prettier
pnpm test         # Vitest (server-side tests only)
pnpm db:push      # drizzle-kit generate + migrate
```

Run a single test file:
```bash
pnpm vitest run server/i18n.test.ts
```

## Architecture

This is a **single-server full-stack app**: one Express process serves both the tRPC API and the Vite-built frontend. In development, Vite runs as middleware inside Express.

```
server/_core/index.ts   → Express entry point
server/_core/trpc.ts    → tRPC init, publicProcedure / protectedProcedure / adminProcedure
server/_core/context.ts → tRPC request context (extracts user from JWT cookie)
server/_core/oauth.ts   → OAuth callback → issues JWT session cookie
server/routers.ts       → All tRPC routes (localeRouter, projectRouter, translationKeyRouter, etc.)
server/db.ts            → All Drizzle query functions
drizzle/schema.ts       → Single source of truth for DB schema + exported TS types
shared/const.ts         → Constants shared between client and server
shared/types.ts         → Re-exports drizzle schema types for client use

client/src/main.tsx     → tRPC + React Query setup, auto-redirect on UNAUTHED_ERR_MSG
client/src/App.tsx      → wouter routing (/, /dashboard, /locales, /editor, /history, /users)
client/src/lib/trpc.ts  → createTRPCReact<AppRouter>() — typed client
```

### Path aliases (both Vite and Vitest)
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

### Data model

Projects → TranslationKeys (dot-notation `keyPath`, soft-deleted) → Translations (per locale, per key). TranslationVersions group changes; TranslationHistory records every create/update/delete with `versionId`. TranslationExports snapshot JSON at export time.

### Auth & roles

Users authenticate locally via email + password (`auth.localLogin` tRPC mutation). A JWT signed with `JWT_SECRET` is issued and stored as cookie `app_session_id`; verification on every tRPC request happens in `server/_core/sdk.ts` (`authenticateRequest`). No external OAuth provider is used. Roles: `admin` > `editor` > `rd` / `qa`. The `requireRole` helper in `server/routers.ts` enforces access; `adminProcedure` and `editorProcedure` are role-gated middleware chains built on top of `protectedProcedure`.

### UI components

`client/src/components/ui/` contains shadcn/ui components (Radix-based). Page-level components live in `client/src/pages/`. Use `sonner` for toast notifications.

### Database

Drizzle ORM with `mysql2`, targeting MySQL 8.0+ or TiDB. `getDb()` in `server/db.ts` is a lazy singleton — it returns `null` when `DATABASE_URL` is unset, so all DB functions must handle the `null` case gracefully. Schema changes: edit `drizzle/schema.ts`, then run `pnpm db:push`.

### Environment variables

Required: `DATABASE_URL`, `JWT_SECRET`, `OWNER_OPEN_ID`. Optional: `OWNER_NAME`, `LOCAL_AUTH_USERNAME` / `LOCAL_AUTH_PASSWORD` (single shared bootstrap login), and AI/analytics vars prefixed `BUILT_IN_FORGE_` or `VITE_`.
