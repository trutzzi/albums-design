export interface DeliverablePhoto {
  photoId: string;
  fileName: string;
  byteSize: number;
  /** The full-resolution original — this is what a client downloads. */
  read(): Promise<Buffer>;
}

export interface DeliveryProject {
  id: string;
  name: string;
}

/**
 * What delivery needs from Media Ingestion without importing its aggregates:
 * the shoot's name, and every original that can still be handed over. After the
 * retention window some originals no longer exist anywhere, so the split between
 * what is available and what is missing is part of the answer.
 */
export interface DeliveryGateway {
  loadProject(projectId: string): Promise<DeliveryProject | undefined>;
  listDeliverable(projectId: string): Promise<{ available: DeliverablePhoto[]; missing: number }>;
}

export interface DownloadNotifier {
  photosDownloaded(params: {
    projectId: string;
    sessionId: string;
    clientName: string;
    photoCount: number;
    byteSize: number;
    /** 1 for the first time the client downloads, 2 for the second, … */
    downloadNumber: number;
  }): Promise<void>;
}

/** Who at the studio should hear about a client's activity. */
export interface StudioContacts {
  forProject(
    projectId: string,
  ): Promise<{ projectName: string; ownerEmails: string[]; studioName?: string } | undefined>;
}
