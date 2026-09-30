/** The parts of a studio's plan that other modules act on, without depending on billing. */
export interface PlanFeatures {
  /** Client review pages carry a watermark. */
  watermarkDrafts: boolean;
  /** Exported PDFs carry a watermark. */
  watermarkExports: boolean;
  /** Photos one shoot may hold; `null` for unlimited. */
  maxPhotosPerShoot: number | null;
  /** May send clients a full-resolution download link. */
  clientDownloadLinks: boolean;
}

export interface PlanFeatureDirectory {
  forProject(projectId: string): Promise<PlanFeatures>;
}

/** What an album gets when its studio's plan cannot be found: never punish a lookup gap. */
export const NO_WATERMARKS: PlanFeatures = {
  watermarkDrafts: false,
  watermarkExports: false,
  maxPhotosPerShoot: null,
  clientDownloadLinks: true,
};
