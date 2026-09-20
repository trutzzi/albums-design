export interface ClientContact {
  /** The shoot the link belongs to, whichever kind of link asked. */
  projectId: string;
  projectName: string;
  name: string | undefined;
  email: string | undefined;
}

/**
 * Who a shoot is for. The name and address live on the shoot, so a photographer types them
 * once and every selection, review and download link prefills from them — and whatever they
 * type while making a link is remembered for the next one.
 */
export interface ClientContactDirectory {
  forProject(projectId: string): Promise<ClientContact | undefined>;
  /** Album review links hang off an album; this resolves the shoot behind it. */
  forAlbum(albumId: string): Promise<ClientContact | undefined>;
  remember(projectId: string, contact: { name?: string | undefined; email?: string | undefined }): Promise<void>;
}
