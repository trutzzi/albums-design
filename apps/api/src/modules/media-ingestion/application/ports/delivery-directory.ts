/** What media ingestion needs to know about export: which shoots have been delivered, and how long ago. */
export interface DeliveryDirectory {
  /**
   * Shoots whose *latest* completed export finished before `cutoff`. A re-export
   * restarts the clock, so a shoot still being revised is never swept.
   */
  projectsDeliveredBefore(cutoff: Date): Promise<string[]>;
}
