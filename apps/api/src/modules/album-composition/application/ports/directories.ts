import type { CandidatePhoto } from "../../domain/layout-planner";

export interface ProjectSummary {
  projectId: string;
  studioId: string;
  name: string;
}

/** Anti-corruption boundary: Album Composition never reaches into Media Ingestion directly. */
export interface ProjectDirectory {
  findProject(projectId: string): Promise<ProjectSummary | undefined>;
}

export interface AnalysedPhotoDirectory {
  listForProject(projectId: string): Promise<CandidatePhoto[]>;
}

export interface QuotaDecision {
  allowed: boolean;
  reason?: string;
}

/** Implemented by Identity & Billing so plan limits are enforced at the point of value. */
export interface AlbumQuotaPolicy {
  ensureCanCreateAlbum(studioId: string): Promise<QuotaDecision>;
  recordAlbumCreated(studioId: string): Promise<void>;
}
