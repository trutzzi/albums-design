import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PhotoByteSource } from "../../application/ports/photo-source";

export class S3PhotoByteSource implements PhotoByteSource {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async read(storageKey: string): Promise<Uint8Array> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    if (!object.Body) throw new Error(`Object ${storageKey} has no body.`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
}
