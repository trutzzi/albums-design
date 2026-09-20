export interface PickableProject {
  id: string;
  name: string;
}

export interface PickablePhoto {
  id: string;
  fileName: string;
  /** Spread-sized copy for the lightbox — never the original. */
  previewUrl: string;
  /** Grid-sized copy, a few tens of kilobytes. */
  thumbnailUrl: string;
}

/**
 * What client selection needs from Media Ingestion, without importing its
 * aggregates: the shoot's name, the photos that have something to show, and
 * whether a given id really belongs to the shoot.
 */
export interface PickGateway {
  loadProject(projectId: string): Promise<PickableProject | undefined>;
  listPhotos(projectId: string): Promise<PickablePhoto[]>;
  hasPhoto(projectId: string, photoId: string): Promise<boolean>;
}

export interface PickNotifier {
  picksSubmitted(params: {
    projectId: string;
    sessionId: string;
    clientName: string;
    photoIds: string[];
  }): Promise<void>;
}
