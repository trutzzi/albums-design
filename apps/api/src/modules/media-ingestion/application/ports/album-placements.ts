/**
 * What media ingestion needs to know about albums, without importing the album
 * aggregate: which photos are actually placed on them. Implemented by a gateway
 * over Album Composition, the same anti-corruption shape the other modules use.
 */
export interface AlbumPlacementDirectory {
  /** The photos placed on one album, and the project it belongs to. `undefined` if the album is gone. */
  forAlbum(albumId: string): Promise<{ projectId: string; photoIds: string[] } | undefined>;
  /** Every photo placed on any album of the project — the set that must survive retention. */
  forProject(projectId: string): Promise<string[]>;
}
