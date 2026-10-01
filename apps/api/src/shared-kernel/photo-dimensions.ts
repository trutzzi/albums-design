/** A photo's upright pixel size (EXIF rotation applied), for showing it at its real proportions. */
export interface PhotoDimensions {
  width: number;
  height: number;
}

/**
 * Each photo's size, for the modules that lay photos out (the client galleries) without
 * knowing anything about how photos are analysed. Photos not analysed yet are absent.
 */
export interface PhotoDimensionsDirectory {
  forProject(projectId: string): Promise<Map<string, PhotoDimensions>>;
}
