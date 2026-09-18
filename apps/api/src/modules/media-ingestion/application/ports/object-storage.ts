export interface PresignedUpload {
  url: string;
  expiresInSeconds: number;
}

export interface ObjectHead {
  byteSize: number;
  etag: string | undefined;
}

export interface ObjectStorage {
  presignPut(params: { key: string; contentType: string; expiresInSeconds: number }): Promise<PresignedUpload>;
  headObject(key: string): Promise<ObjectHead | undefined>;
  /** Browser-reachable read URL, so an <img> can load an original without an auth header. */
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
}

/** Reading and writing whole objects, which derivative generation needs. */
export interface ObjectStorageWithBody extends ObjectStorage {
  getObject(key: string): Promise<Buffer>;
  putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void>;
  delete(key: string): Promise<void>;
}
