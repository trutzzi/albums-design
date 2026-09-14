import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectHead, ObjectStorage, PresignedUpload } from "../../application/ports/object-storage";

export interface S3ObjectStorageConfig {
  bucket: string;
  /** Reachable from this server process — used for HEAD/GET calls. */
  endpoint: string;
  /** Reachable from the browser — used only to sign PUT URLs handed to clients. Falls back to `endpoint`. */
  publicEndpoint?: string | undefined;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(config: S3ObjectStorageConfig) {
    this.bucket = config.bucket;
    const credentials = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey };
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials,
    });
    this.presignClient = config.publicEndpoint
      ? new S3Client({
          endpoint: config.publicEndpoint,
          region: config.region,
          forcePathStyle: config.forcePathStyle,
          credentials,
        })
      : this.client;
  }

  async presignPut(params: { key: string; contentType: string; expiresInSeconds: number }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
    });
    const url = await getSignedUrl(this.presignClient, command, { expiresIn: params.expiresInSeconds });
    return { url, expiresInSeconds: params.expiresInSeconds };
  }

  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.presignClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async headObject(key: string): Promise<ObjectHead | undefined> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { byteSize: result.ContentLength ?? 0, etag: result.ETag };
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotFound" || error.name === "NoSuchKey")
  );
}
