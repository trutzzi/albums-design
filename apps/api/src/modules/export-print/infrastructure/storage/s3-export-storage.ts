import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ExportStorage } from "../../application/ports/album-pdf-renderer";

export class S3ExportStorage implements ExportStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly presignClient: S3Client = client,
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: contentType,
      }),
    );
  }

  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    // S3's own DeleteObject is already idempotent — a missing key is a 204,
    // not an error — so nothing extra is needed to satisfy the port's contract.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
