import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ReviewSession } from "./review-session";

export interface ReviewSessionRepository {
  save(session: ReviewSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<ReviewSession | undefined>;
  findByTokenHash(tokenHash: string): Promise<ReviewSession | undefined>;
  findByAlbumId(albumId: UniqueEntityId): Promise<ReviewSession[]>;
  /**
   * Many albums' review links in one query, for the shoots list — the open notes counted in the
   * database rather than every comment loaded.
   */
  progressByAlbumIds(albumIds: UniqueEntityId[]): Promise<ReviewProgress[]>;
  delete(id: UniqueEntityId): Promise<void>;
}

export interface ReviewProgress {
  albumId: string;
  status: string;
  openComments: number;
}
