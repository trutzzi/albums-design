import { Readable } from "node:stream";
import {
  StorageObjectNotFoundError,
  assertSafeKey,
  normalizePrefix,
  type StorageProvider,
  type StoredObjectInfo,
} from "../shared-kernel/storage-provider";
import type { MediaUrlSigner } from "../infrastructure/storage/media-url-signer";

/**
 * A long-term tier held in memory, for demo mode and tests: exercises the full
 * two-tier pipeline (promotion, retention, signed preview URLs) with no external
 * account. Same contract as the real adapters, including idempotent deletes.
 */
export class InMemoryStorageProvider implements StorageProvider {
  readonly id = "memory";
  readonly objects = new Map<string, Buffer>();

  constructor(private readonly signer: MediaUrlSigner) {}

  async upload(key: string, body: Buffer): Promise<void> {
    assertSafeKey(key);
    this.objects.set(key, Buffer.from(body));
  }

  async openRead(key: string): Promise<Readable> {
    assertSafeKey(key);
    const body = this.objects.get(key);
    if (!body) throw new StorageObjectNotFoundError(key);
    return Readable.from([body]);
  }

  async head(key: string): Promise<StoredObjectInfo | undefined> {
    assertSafeKey(key);
    const body = this.objects.get(key);
    return body ? { key, size: body.byteLength } : undefined;
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    const base = `${normalizePrefix(prefix)}/`;
    return [...this.objects]
      .filter(([key]) => key.startsWith(base))
      .map(([key, body]) => ({ key, size: body.byteLength }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    const base = `${normalizePrefix(prefix)}/`;
    for (const key of [...this.objects.keys()]) if (key.startsWith(base)) this.objects.delete(key);
  }

  async getUrl(key: string, options: { expiresInSeconds: number }): Promise<string> {
    assertSafeKey(key);
    return this.signer.sign(key, options.expiresInSeconds);
  }
}
