import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ReviewSession } from "./review-session";

export interface ReviewSessionRepository {
  save(session: ReviewSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<ReviewSession | undefined>;
  findByTokenHash(tokenHash: string): Promise<ReviewSession | undefined>;
  findByAlbumId(albumId: UniqueEntityId): Promise<ReviewSession[]>;
  /** Many albums' review links in one query, for the shoots list. */
  findByAlbumIds(albumIds: UniqueEntityId[]): Promise<ReviewSession[]>;
  delete(id: UniqueEntityId): Promise<void>;
}
