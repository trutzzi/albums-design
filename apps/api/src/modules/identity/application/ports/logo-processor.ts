/** Turns an uploaded logo into the small PNG client pages show. */
export interface LogoProcessor {
  /** Throws when the upload is not an image we accept. */
  normalise(dataUrl: string): Promise<string>;
}
