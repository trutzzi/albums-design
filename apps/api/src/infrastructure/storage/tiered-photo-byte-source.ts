import type { PhotoByteSource } from "../../modules/photo-intelligence/application/ports/photo-source";
import type { StorageProvider } from "../../shared-kernel/storage-provider";

/**
 * Reads an original from the staging bucket, and — once retention has deleted
 * that copy — from long-term storage instead. Without this, re-exporting an
 * album after the retention window would fail for exactly the photos that were
 * deliberately moved out of staging.
 */
export class TieredPhotoByteSource implements PhotoByteSource {
  constructor(
    private readonly staging: PhotoByteSource,
    private readonly permanent: StorageProvider,
  ) {}

  async read(storageKey: string): Promise<Uint8Array> {
    try {
      return await this.staging.read(storageKey);
    } catch (stagingError) {
      if (!(await this.permanent.head(storageKey))) throw stagingError;
      const chunks: Buffer[] = [];
      for await (const chunk of await this.permanent.openRead(storageKey)) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
  }
}
