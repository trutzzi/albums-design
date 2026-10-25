/** A shoot's albums as the activity timeline needs them, without importing Album Composition. */
export interface ShootAlbums {
  forProject(projectId: string): Promise<{ id: string; createdAt: Date }[]>;
}
