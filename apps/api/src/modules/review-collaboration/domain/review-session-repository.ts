import type { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ReviewSession } from "./review-session";

export interface ReviewSessionRepository {
  save(session: ReviewSession): Promise<void>;
  findById(id: UniqueEntityId): Promise<ReviewSession | undefined>;
  findByTokenHash(tokenHash: string): Promise<ReviewSession | undefined>;
  findByAlbumId(albumId: UniqueEntityId): Promise<ReviewSession[]>;
}
