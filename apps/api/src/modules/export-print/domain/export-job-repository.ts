import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ExportJob } from "./export-job";

export interface ExportJobRepository {
  save(job: ExportJob): Promise<void>;
  findById(id: UniqueEntityId): Promise<ExportJob | undefined>;
  findByAlbumId(albumId: UniqueEntityId): Promise<ExportJob[]>;
  /** READY jobs whose delivery completed before `cutoff` — what retention sweeps start from. */
  findReadyCompletedBefore(cutoff: Date): Promise<ExportJob[]>;
  /** Idempotent: deleting a job that's already gone must not throw. */
  delete(id: UniqueEntityId): Promise<void>;
}
