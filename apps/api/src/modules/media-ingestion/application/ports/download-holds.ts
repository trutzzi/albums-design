/**
 * What media ingestion needs to know about client delivery, without importing
 * its aggregates: whether a shoot still has a download link a client can use.
 * The originals must outlive that link — deleting them while the link says
 * "available for 30 days" would break the promise the client was shown.
 */
export interface DownloadHoldDirectory {
  hasActiveLink(projectId: string, now: Date): Promise<boolean>;
}
