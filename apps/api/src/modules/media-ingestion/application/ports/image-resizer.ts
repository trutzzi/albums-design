/**
 * Shrinks an image for display. Kept as a port because the editor's responsiveness
 * depends on it but the choice of encoder does not — sharp today, anything else
 * tomorrow.
 */
export interface ResizeRequest {
  data: Buffer;
  /** Longest edge of the result, in pixels. */
  longestEdge: number;
  quality: number;
}

export interface ImageResizer {
  toJpeg(request: ResizeRequest): Promise<Buffer>;
}
