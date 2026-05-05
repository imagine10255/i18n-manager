/**
 * 一次性 bootstrap 腳本：把 admin 的 email + 密碼直接寫進 DB。
 *
 * 背景：登入流程改成 email + password 後，舊有的 admin row（透過 OAuth /
 * OWNER_OPEN_ID 建立）通常 email 欄位是空的，導致 UI 無法用任何 email 登入。
 * 跑這支腳本一次，把 admin 的 email + password 補上即可。
 *
 * 用法：
 *   pnpm set-admin <email> <password>
 *   pnpm set-admin admin@example.com myPassword123
 *
 * 找尋 admin row 的優先順序：
 *   1) openId === OWNER_OPEN_ID（最可靠：env 指定的擁有者）
 *   2) role === "admin" 的第一筆（fallback：DB 裡任何一個 admin）
 *   3) 都找不到 → 用 OWNER_OPEN_ID 建一個新的 admin（OWNER_OPEN_ID 必須有設）
 *
 * 跑完之後 admin 就能用 <email> + <password> 從登入頁進來。
 */
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "../drizzle/schema";
import { hashPassword } from "../server/_core/password";

// 與 dev script 一致：優先讀 .env.local，fallback 到 .env
loadEnv({ path: ".env.local" });
loadEnv();

function fail(msg: string): never {
  console.error(`\n[set-admin] ❌ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);

  if (!emailArg || !passwordArg) {
    fail(
      "用法：pnpm set-admin <email> <password>\n" +
        "範例：pnpm set-admin admin@example.com myPassword123"
    );
  }

  const email = emailArg.trim().toLowerCase();
  const password = passwordArg;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`Email 格式錯誤：${emailArg}`);
  }
  if (password.length < 6) {
    fail("密碼長度至少 6 個字元");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail("DATABASE_URL 未設定（請檢查 .env.local）");
  }

  const ownerOpenId = process.env.OWNER_OPEN_ID ?? "";
  const ownerName = process.env.OWNER_NAME ?? "Admin";

  const db = drizzle(databaseUrl);

  // 1) 先 by openId 找
  let admin =
    ownerOpenId !== ""
      ? (
          await db
            .select()
            .from(users)
            .where(eq(users.openId, ownerOpenId))
            .limit(1)
        )[0]
      : undefined;

  // 2) fallback：找任何一個 role="admin"
  if (!admin) {
    admin = (
      await db.select().from(users).where(eq(users.role, "admin")).limit(1)
    )[0];
  }

  // 先檢查目標 email 是不是被別人佔走（避免 unique conflict 寫不進去）
  const conflict = (
    await db.select().from(users).where(eq(users.email, email)).limit(1)
  )[0];
  if (conflict && (!admin || conflict.id !== admin.id)) {
    fail(
      `Email「${email}」已被使用者 id=${conflict.id} (openId=${conflict.openId}) 佔用。\n` +
        `請改用其他 email，或先把那筆移除/改名。`
    );
  }

  const passwordHash = await hashPassword(password);

  if (admin) {
    await db
      .update(users)
      .set({
        email,
        passwordHash,
        // 確保權限正確、可登入
        role: "admin",
        isActive: true,
        loginMethod: admin.loginMethod ?? "local",
      })
      .where(eq(users.id, admin.id));

    console.log(
      `\n[set-admin] ✅ 已更新 admin (id=${admin.id}, openId=${admin.openId})\n` +
        `  email        = ${email}\n` +
        `  passwordHash = (重新雜湊)\n` +
        `  role         = admin\n` +
        `  isActive     = true\n\n` +
        `現在可以到登入頁用 ${email} + 你剛剛輸入的密碼登入。\n`
    );
    process.exit(0);
  }

  // 3) DB 裡完全沒有 admin → 用 OWNER_OPEN_ID 建一個
  if (!ownerOpenId) {
    fail(
      "DB 裡沒有任何 admin，且 OWNER_OPEN_ID 未設定，無法決定要用什麼 openId 建立 admin。\n" +
        "請先在 .env.local 設 OWNER_OPEN_ID=<某個唯一字串>，再跑一次。"
    );
  }

  await db.insert(users).values({
    openId: ownerOpenId,
    name: ownerName,
    email,
    passwordHash,
    role: "admin",
    isActive: true,
    loginMethod: "local",
    lastSignedIn: new Date(),
  });

  console.log(
    `\n[set-admin] ✅ 已建立新的 admin (openId=${ownerOpenId})\n` +
      `  email = ${email}\n` +
      `  role  = admin\n\n` +
      `現在可以到登入頁用 ${email} + 你剛剛輸入的密碼登入。\n`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[set-admin] 失敗：", err);
  process.exit(1);
});
