import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

/**
 * Hash a password using Node's built-in scrypt. Format: `salt:hash` (hex).
 * Salt is 16 random bytes; output key is 64 bytes.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

/**
 * Constant-time check of a password against a stored `salt:hash` string.
 * Returns false (rather than throwing) for malformed input.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!password || !stored || !stored.includes(":")) return false;
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  try {
    const derived = await scrypt(password, salt, 64);
    const known = Buffer.from(hashHex, "hex");
    if (derived.length !== known.length) return false;
    return timingSafeEqual(derived, known);
  } catch {
    return false;
  }
}
