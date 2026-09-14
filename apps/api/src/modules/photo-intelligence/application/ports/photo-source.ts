export interface SourcePhoto {
  photoId: string;
  projectId: string;
  storageKey: string;
}

/** Reads bytes for a stored original. Implemented over S3 in production. */
export interface PhotoByteSource {
  read(storageKey: string): Promise<Uint8Array>;
}
