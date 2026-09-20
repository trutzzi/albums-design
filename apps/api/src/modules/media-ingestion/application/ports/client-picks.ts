/**
 * What media ingestion needs to know about client selection, without importing
 * its aggregates: which photos a client has *submitted* as their picks. A
 * submitted pick counts as "selected" for the two-tier pipeline, the same as a
 * photo placed on an album.
 */
export interface ClientPickDirectory {
  /** Every photo any client submitted as a pick for the project — the set that must survive retention. */
  forProject(projectId: string): Promise<string[]>;
}
