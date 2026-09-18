import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Node's built-in `scrypt` — deliberately not a third-party dependency. It's
 * a memory-hard KDF, which is what actually matters for password storage;
 * pulling in bcrypt/argon2 would buy nothing here but another package to keep
 * patched. The stored format is `<salt-hex>:<hash-hex>` so verification never
 * needs a second lookup for the salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  // Lengths can differ if `stored` is malformed; timingSafeEqual throws rather
  // than returning false in that case, so it has to be checked first.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
