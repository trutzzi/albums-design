/**
 * Media Ingestion owns the photo's lifecycle; this context only reports that analysis
 * finished, so the upload state machine can close itself out.
 */
export interface PhotoLifecycle {
  markAnalysed(photoId: string): Promise<void>;
  /** Analysis gave up on this photo for good. A photo already analysed is left as it is. */
  markAnalysisFailed(photoId: string): Promise<void>;
}
