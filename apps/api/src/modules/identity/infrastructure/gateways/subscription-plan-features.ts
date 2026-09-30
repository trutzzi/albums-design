import { UniqueEntityId } from "@albumflow/domain-kernel";
import type { ProjectRepository } from "../../../media-ingestion/domain/project-repository";
import { NO_WATERMARKS, type PlanFeatureDirectory, type PlanFeatures } from "../../../../shared-kernel/plan-features";
import type { SubscriptionRepository } from "../../domain/repositories";

/** Answers "what does this shoot's studio pay for?" from its current subscription. */
export class SubscriptionPlanFeatureDirectory implements PlanFeatureDirectory {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async forProject(projectId: string): Promise<PlanFeatures> {
    const project = await this.projects.findById(UniqueEntityId.create(projectId));
    if (!project) return NO_WATERMARKS;
    const subscription = await this.subscriptions.findByStudioId(project.studioId);
    if (!subscription) return NO_WATERMARKS;
    const { watermarkDrafts, watermarkExports } = subscription.plan;
    return { watermarkDrafts, watermarkExports };
  }
}
