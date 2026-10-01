import type { Database } from "../db/client";
import {
  DrizzleStudioMemberRepository,
  DrizzleStudioRepository,
  DrizzleSubscriptionRepository,
} from "../modules/identity/infrastructure/persistence/drizzle-studio-repository";
import { DrizzleProjectRepository } from "../modules/media-ingestion/infrastructure/persistence/drizzle-project-repository";
import { DrizzlePhotoRepository } from "../modules/media-ingestion/infrastructure/persistence/drizzle-photo-repository";
import { DrizzlePhotoAnalysisRepository } from "../modules/photo-intelligence/infrastructure/persistence/drizzle-photo-analysis-repository";
import { DrizzleAlbumRepository } from "../modules/album-composition/infrastructure/persistence/drizzle-album-repository";
import { DrizzleReviewSessionRepository } from "../modules/review-collaboration/infrastructure/persistence/drizzle-review-session-repository";
import { DrizzlePickSessionRepository } from "../modules/review-collaboration/infrastructure/persistence/drizzle-pick-session-repository";
import { DrizzleDownloadSessionRepository } from "../modules/review-collaboration/infrastructure/persistence/drizzle-download-session-repository";
import { DrizzleExportJobRepository } from "../modules/export-print/infrastructure/persistence/drizzle-export-job-repository";
import { DrizzleFeedbackRepository } from "../modules/platform-admin/infrastructure/feedback-repositories";

/**
 * Every aggregate's repository, built once and shared: several contexts read the same
 * tables through their own gateways (deleting a shoot touches six of them), so one
 * instance each keeps that wiring in a single place.
 */
export function buildRepositories(db: Database) {
  return {
    studios: new DrizzleStudioRepository(db),
    subscriptions: new DrizzleSubscriptionRepository(db),
    members: new DrizzleStudioMemberRepository(db),
    projects: new DrizzleProjectRepository(db),
    photos: new DrizzlePhotoRepository(db),
    analyses: new DrizzlePhotoAnalysisRepository(db),
    albums: new DrizzleAlbumRepository(db),
    reviewSessions: new DrizzleReviewSessionRepository(db),
    pickSessions: new DrizzlePickSessionRepository(db),
    downloadSessions: new DrizzleDownloadSessionRepository(db),
    exportJobs: new DrizzleExportJobRepository(db),
    feedback: new DrizzleFeedbackRepository(db),
  };
}

export type Repositories = ReturnType<typeof buildRepositories>;
