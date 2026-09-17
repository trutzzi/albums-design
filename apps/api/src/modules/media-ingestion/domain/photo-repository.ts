import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { Photo, PhotoStatus } from "./photo";

export interface PhotoRepository {
  save(photo: Photo): Promise<void>;
  findById(id: UniqueEntityId): Promise<Photo | undefined>;
  findByProjectId(projectId: UniqueEntityId): Promise<Photo[]>;

  /**
   * Narrow, single-column writes — deliberately not `save()`.
   *
   * Analysis and derivative generation run as two independent, concurrent
   * BullMQ jobs against the SAME photo row, each starting from its own
   * `findById` snapshot. If either persisted by re-saving that whole
   * snapshot, whichever job committed last would silently revert the other's
   * change to a field it never touched — status reverting to
   * ANALYSIS_QUEUED after derivatives saved, or hasDerivatives reverting to
   * false after analysis saved, depending on nothing but timing. Touching
   * only the one column each operation actually changed makes the two jobs
   * touch disjoint columns of the same row, which is safe under Postgres's
   * ordinary MVCC regardless of which one commits first.
   */
  updateStatus(id: UniqueEntityId, status: PhotoStatus): Promise<void>;
  markDerivativesReady(id: UniqueEntityId): Promise<void>;
}
