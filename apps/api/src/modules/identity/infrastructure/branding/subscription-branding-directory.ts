import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ClientBrandingDTO } from "@albumflow/contracts";
import type { ProjectRepository } from "../../../media-ingestion/domain/project-repository";
import type { StudioBrandingDirectory } from "../../../../shared-kernel/studio-branding";
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
    if (!studio?.branding || !subscription?.plan.whiteLabelReview) return null;
    return {
      name: studio.branding.displayName || studio.name,
      accent: studio.branding.accent,
      logo: studio.branding.logo,
    };
  }
}
