import { UniqueEntityId } from "@albumflow/domain-kernel";
import { DEFAULT_CLIENT_STYLE, type ClientBrandingDTO } from "@albumflow/contracts";
import type { ProjectRepository } from "#src/modules/media-ingestion/domain/project-repository";
import type { StudioBrandingDirectory } from "#src/shared-kernel/studio-branding";
import type { StudioRepository, SubscriptionRepository } from "../../domain/repositories";

/** A shoot's studio branding, but only while the studio's plan includes white-label pages. */
export class SubscriptionStudioBrandingDirectory implements StudioBrandingDirectory {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly studios: StudioRepository,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async forProject(projectId: string): Promise<ClientBrandingDTO | null> {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return null;
    const [studio, subscription] = await Promise.all([
      this.studios.findById(project.studioId),
      this.subscriptions.findByStudioId(project.studioId),
    ]);
    if (!studio || (!studio.branding && !studio.clientStyle) || !subscription?.plan.whiteLabelReview) return null;
    const branding = studio.branding;
    return {
      name: branding?.displayName || studio.name,
      accent: branding?.accent ?? null,
      logo: branding?.logo ?? null,
      website: branding?.website ?? null,
      phone: branding?.phone ?? null,
      email: branding?.email ?? null,
      style: studio.clientStyle ?? DEFAULT_CLIENT_STYLE,
    };
  }
}
