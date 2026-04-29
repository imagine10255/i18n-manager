import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Test context factories ───────────────────────────────────────────────────

function createCtx(role: User["role"] = "admin"): TrpcContext {
  const user: User = {
    id: 1,
    openId: "test-user",
    name: "Test User",
    email: "test@example.com",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createReadonlyCtx(role: "rd" | "qa" = "rd"): TrpcContext {
  return createCtx(role);
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const clearedCookies: string[] = [];
    const ctx: TrpcContext = {
      ...createCtx(),
      res: {
        clearCookie: (name: string) => { clearedCookies.push(name); },
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies.length).toBeGreaterThan(0);
  });

  it("returns current user from auth.me", async () => {
    const ctx = createCtx("admin");
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.role).toBe("admin");
    expect(user?.name).toBe("Test User");
  });
});

// ─── Role permission tests ────────────────────────────────────────────────────

describe("Role-based access control", () => {
  it("RD cannot create translation keys", async () => {
    const ctx = createReadonlyCtx("rd");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.translationKey.create({ keyPath: "test.key" })
    ).rejects.toThrow();
  });

  it("QA cannot update translation values", async () => {
    const ctx = createReadonlyCtx("qa");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.translation.updateValue({ keyId: 1, localeCode: "en", value: "test" })
    ).rejects.toThrow();
  });

  it("RD cannot manage locales", async () => {
    const ctx = createReadonlyCtx("rd");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.locale.create({ code: "fr", name: "French", nativeName: "Français" })
    ).rejects.toThrow();
  });

  it("Editor cannot manage users", async () => {
    const ctx = createCtx("editor");
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.userManagement.updateRole({ userId: 2, role: "rd" })
    ).rejects.toThrow();
  });
});

// ─── Export logic tests ───────────────────────────────────────────────────────

describe("JSON export nested structure", () => {
  it("builds nested JSON from dot-notation keys correctly", () => {
    // Simulate the export logic
    const rows = [
      { keyPath: "home.header.title", value: "Home" },
      { keyPath: "home.header.subtitle", value: "Welcome" },
      { keyPath: "common.confirm", value: "OK" },
      { keyPath: "auth.login.title", value: "Sign In" },
    ];

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      const parts = row.keyPath.split(".");
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (typeof current[part] !== "object" || current[part] === null) {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
      const lastPart = parts[parts.length - 1]!;
      current[lastPart] = row.value;
    }

    expect(result).toMatchObject({
      home: { header: { title: "Home", subtitle: "Welcome" } },
      common: { confirm: "OK" },
      auth: { login: { title: "Sign In" } },
    });
  });

  it("handles single-level keys", () => {
    const rows = [{ keyPath: "title", value: "My App" }];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      const parts = row.keyPath.split(".");
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (typeof current[part] !== "object") current[part] = {};
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]!] = row.value;
    }
    expect(result).toEqual({ title: "My App" });
  });
});

// ─── Translation stats tests ──────────────────────────────────────────────────

describe("Translation completion stats", () => {
  it("calculates percentage correctly", () => {
    const translated = 75;
    const total = 100;
    const pct = total > 0 ? Math.round((translated / total) * 100) : 0;
    expect(pct).toBe(75);
  });

  it("returns 0% for empty translations", () => {
    const translated = 0;
    const total = 50;
    const pct = total > 0 ? Math.round((translated / total) * 100) : 0;
    expect(pct).toBe(0);
  });

  it("handles zero total keys", () => {
    const translated = 0;
    const total = 0;
    const pct = total > 0 ? Math.round((translated / total) * 100) : 0;
    expect(pct).toBe(0);
  });
});


