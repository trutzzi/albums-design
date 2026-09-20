import type { Readable } from "node:stream";

export interface StoredObjectInfo {
  key: string;
  size: number;
  lastModified?: Date | undefined;
}

export class StorageObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`No object stored at ${key}.`);
    this.name = "StorageObjectNotFoundError";
  }
}

/**
 * Long-lived storage for the things that outlive a shoot's working set:
 * display previews and the full-resolution originals of selected photos.
 *
 * Keys are always relative, forward-slash paths (`studios/{id}/projects/{id}/...`);
 * how they map onto a real backend — a WebDAV folder, an S3 bucket — is the
 * implementation's business. Calling code must never build a provider-specific
 * path or URL itself, so swapping DigiStorage for R2 or B2 touches one adapter.
 */
export interface StorageProvider {
  readonly id: string;

  /**
   * Whole-object write, atomic from a reader's point of view: `head()` never
   * reports an object that is only partly written. Overwrites an existing key.
   */
  upload(key: string, body: Buffer, options: { contentType: string }): Promise<void>;

  /** Streams the object out. Throws `StorageObjectNotFoundError` before returning if it is absent. */
  openRead(key: string): Promise<Readable>;

  /** `undefined` when absent. The size is what makes retries and promotion idempotent. */
  head(key: string): Promise<StoredObjectInfo | undefined>;

  /** Every object under `prefix`, recursively. An absent prefix is an empty list, not an error. */
  list(prefix: string): Promise<StoredObjectInfo[]>;

  /** Idempotent: deleting a key that is already gone must not throw. */
  delete(key: string): Promise<void>;

  /** Idempotent recursive delete — the per-project cleanup primitive. */
  deletePrefix(prefix: string): Promise<void>;

  /**
   * A URL a browser can load with no credentials, valid for `expiresInSeconds`.
   * Backends with native presigning return that; WebDAV has none, so its adapter
   * returns a signed URL to this API's own `/media/` route instead.
   */
  getUrl(key: string, options: { expiresInSeconds: number }): Promise<string>;
}

/** `a/b/` and `a/b` name the same prefix; validates the result like a key. */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  assertSafeKey(trimmed);
  return trimmed;
}

/** Rejects anything that could climb out of the provider's root. */
export function assertSafeKey(key: string): void {
  const segments = key.split("/");
  if (
    key === "" ||
    key.startsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
    key.includes("\\") ||
    key.includes("\0")
  ) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}
