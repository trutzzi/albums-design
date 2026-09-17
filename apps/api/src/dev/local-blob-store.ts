import type {
  ObjectHead,
  ObjectStorageWithBody,
  PresignedUpload,
} from "../modules/media-ingestion/application/ports/object-storage";
import type { PhotoByteSource } from "../modules/photo-intelligence/application/ports/photo-source";
import type { ExportStorage } from "../modules/export-print/application/ports/album-pdf-renderer";

interface StoredBlob {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Stands in for S3 in demo mode: bytes live in this process and are served back
 * over the API's own `/dev-storage` routes, so the browser can PUT an upload and
 * load a preview with no object store running.
 */
export class LocalBlobStore
  implements ObjectStorageWithBody, PhotoByteSource, ExportStorage
{
  private readonly blobs = new Map<string, StoredBlob>();

  constructor(private readonly publicBaseUrl: string) {}

  private urlFor(key: string): string {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${this.publicBaseUrl}/dev-storage/${encoded}`;
  }

  async presignPut(params: { key: string; expiresInSeconds: number }): Promise<PresignedUpload> {
    return { url: this.urlFor(params.key), expiresInSeconds: params.expiresInSeconds };
  }

  async presignGet(key: string): Promise<string> {
    return this.urlFor(key);
  }

  async headObject(key: string): Promise<ObjectHead | undefined> {
    const blob = this.blobs.get(key);
    return blob ? { byteSize: blob.bytes.byteLength, etag: `"${blob.bytes.byteLength}"` } : undefined;
  }

  async read(key: string): Promise<Uint8Array> {
    const blob = this.blobs.get(key);
    if (!blob) throw new Error(`No object stored at ${key}`);
    return blob.bytes;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.blobs.set(key, { bytes, contentType });
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }

  async getObject(key: string): Promise<Buffer> {
    return Buffer.from(await this.read(key));
  }

  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await this.put(params.key, new Uint8Array(params.body), params.contentType);
  }

  get(key: string): StoredBlob | undefined {
    return this.blobs.get(key);
  }

  get size(): number {
    return this.blobs.size;
  }
}
