import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Reversible encryption for the few secrets the studio has to be able to read
 * back later (a client link and its password). AES-256-GCM, so a tampered or
 * truncated value fails to open instead of decrypting to garbage. The key is
 * derived from the server's JWT secret, so nothing new has to be configured —
 * and rotating that secret makes old sealed values unreadable (the password
 * *check* is a separate hash and keeps working; only re-displaying is lost).
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string, purpose = "albumflow:client-links") {
    this.key = Buffer.from(hkdfSync("sha256", secret, "albumflow-secret-box", purpose, 32));
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
  }

  /** `undefined` when the value was not sealed with this key, or was altered. */
  open(sealed: string): string | undefined {
    const [version, iv, tag, data] = sealed.split(".");
    if (version !== "v1" || !iv || !tag || !data) return undefined;
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      return undefined;
    }
  }
}
