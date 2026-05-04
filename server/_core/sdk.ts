import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

// ─────────────────────────────────────────────────────────────────────────────
// Session SDK — JWT 簽 / 驗 + cookie 認證。
//
// 早期版本走的是 Manus OAuth (`/api/oauth/callback`) + 遠端 user info 同步流程；
// 目前已完全拆除，登入只走 `auth.localLogin`（email + password）。所以這個檔案
// 只負責：
//   • createSessionToken / signSession — login 成功後簽一張 cookie JWT
//   • verifySession                    — 收到請求時驗 cookie
//   • authenticateRequest              — 把 cookie 換成 DB 中的 User
// 沒有任何網路 I/O；只用 ENV.cookieSecret (= JWT_SECRET)。
// ─────────────────────────────────────────────────────────────────────────────

// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  name: string;
};

class SDKServer {
  private deriveLoginMethod(_input: unknown): string | null {
    // Kept as a stable hook in case future SSO providers come back.
    return null;
  }

  /**
   * Create a session token for an openId. Used by `auth.localLogin`.
   * @example
   * const sessionToken = await sdk.createSessionToken("user@example.com");
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        name: options.name || "",
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; name: string } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, name } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return { openId, name };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    const user = await db.getUserByOpenId(sessionUserId);

    if (!user) {
      // 沒有了遠端 OAuth 同步，user 必須在本地存在 (透過 admin 建帳號或
      // localLogin 第一次登入時自動 upsert)。否則直接拒絕。
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
}

export const sdk = new SDKServer();
