import { hasLaunchPrice, monthlyPriceFor } from "../../domain/plan";
import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { DEFAULT_CLIENT_STYLE, type ClientStyle } from "@albumflow/contracts";
import { ConflictError, NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import type { PlanCode } from "../../domain/plan";
import type { LogoProcessor } from "../ports/logo-processor";
import { ForbiddenError } from "./billing.use-case";
import type { StudioMemberRepository, StudioRepository, SubscriptionRepository } from "../../domain/repositories";
import type { StudioBranding } from "../../domain/studio";
import { StudioMember, type StudioRole } from "../../domain/studio-member";

export interface StudioOverview {
  studio: {
    id: string;
    name: string;
    ownerEmail: string;
    createdAt: string;
    branding: StudioBranding | null;
    clientStyle: ClientStyle;
  };
  subscription: {
    planCode: PlanCode;
    planName: string;
    status: string;
    albumsUsed: number;
    albumsIncluded: number | null;
    albumsRemaining: number | null;
    seatsUsed: number;
    seatsIncluded: number | null;
    periodStart: string;
    periodEnd: string;
    watermarkDrafts: boolean;
    watermarkExports: boolean;
    /** True once the studio has paid through the provider, so it can open the billing portal. */
    hasBillingAccount: boolean;
    /** The plan shows the studio's own branding on client pages. */
    whiteLabel: boolean;
    /** What this studio pays per month for its plan. */
    priceEur: number;
    /** The studio joined during the launch offer and keeps launch prices on every plan. */
    launchPrice: boolean;
  };
  members: { id: string; name: string; email: string; role: StudioRole; accepted: boolean }[];
}

export class StudioAdministrationUseCase {
  constructor(
    private readonly studios: StudioRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly members: StudioMemberRepository,
    private readonly logos?: LogoProcessor,
  ) {}

  async overview(studioId: string): Promise<Result<StudioOverview, ApplicationError>> {
    const id = UniqueEntityId.create(studioId);
    const studio = await this.studios.findById(id);
    if (!studio) return Result.failure(new NotFoundError("Studio", studioId));

    const subscription = await this.subscriptions.findByStudioId(id);
    if (!subscription) return Result.failure(new NotFoundError("Subscription", studioId));
    subscription.rollPeriodIfElapsed();
    await this.subscriptions.save(subscription);

    const members = await this.members.listByStudioId(id);
    const plan = subscription.plan;

    return Result.success({
      studio: {
        id: studio.id.toString(),
        name: studio.name,
        ownerEmail: studio.ownerEmail,
        createdAt: studio.createdAt.toISOString(),
        branding: studio.branding ?? null,
        clientStyle: studio.clientStyle ?? DEFAULT_CLIENT_STYLE,
      },
      subscription: {
        planCode: subscription.planCode,
        planName: plan.name,
        status: subscription.status,
        albumsUsed: subscription.albumsUsed,
        albumsIncluded: finite(plan.albumsPerPeriod),
        albumsRemaining: finite(subscription.albumsRemaining),
        seatsUsed: members.length,
        seatsIncluded: finite(plan.seats),
        periodStart: subscription.periodStart.toISOString(),
        periodEnd: subscription.periodEnd.toISOString(),
        watermarkDrafts: plan.watermarkDrafts,
        watermarkExports: plan.watermarkExports,
        hasBillingAccount: subscription.externalCustomerId !== undefined,
        whiteLabel: plan.whiteLabelReview,
        priceEur: monthlyPriceFor(plan, studio.createdAt),
        launchPrice: hasLaunchPrice(studio.createdAt),
      },
      members: members.map((member) => ({
        id: member.id.toString(),
        name: member.name,
        email: member.email,
        role: member.role,
        accepted: member.acceptedAt !== undefined,
      })),
    });
  }

  async inviteMember(params: {
    studioId: string;
    email: string;
    name: string;
    role: StudioRole;
  }): Promise<Result<{ memberId: string }, ApplicationError>> {
    const id = UniqueEntityId.create(params.studioId);
    const subscription = await this.subscriptions.findByStudioId(id);
    if (!subscription) return Result.failure(new NotFoundError("Subscription", params.studioId));

    const existing = await this.members.listByStudioId(id);
    if (existing.some((member) => member.email === params.email)) {
      return Result.failure(new ConflictError(`${params.email} is already on this studio.`));
    }
    if (subscription.seatsRemaining(existing.length) <= 0) {
      return Result.failure(
        new ConflictError(
          `The ${subscription.plan.name} plan includes ${subscription.plan.seats} seats. Upgrade to add more.`,
        ),
      );
    }

    const member = StudioMember.invite({
      studioId: id,
      email: params.email,
      name: params.name,
      role: params.role,
    });
    await this.members.save(member);
    return Result.success({ memberId: member.id.toString() });
  }

  /** The studio's own look on client pages — a Studio Pro feature, set by the owner. */
  async setBranding(
    studioId: string,
    role: string | undefined,
    input: {
      displayName: string;
      accent: string | null;
      logo: string | null;
      website?: string | null | undefined;
      phone?: string | null | undefined;
      email?: string | null | undefined;
    },
  ): Promise<Result<StudioOverview, ApplicationError>> {
    if (role !== undefined && role !== "OWNER") {
      return Result.failure(new ForbiddenError("Only the studio owner can change its branding."));
    }
    const id = UniqueEntityId.create(studioId);
    const [studio, subscription] = await Promise.all([
      this.studios.findById(id),
      this.subscriptions.findByStudioId(id),
    ]);
    if (!studio || !subscription) return Result.failure(new NotFoundError("Studio", studioId));
    if (!subscription.plan.whiteLabelReview) {
      return Result.failure(new ConflictError("Your own branding on client pages comes with the Studio Pro plan."));
    }

    let logo = input.logo;
    // An unchanged logo comes back exactly as stored; only a new upload is processed.
    if (logo && logo !== studio.branding?.logo) {
      if (!this.logos) return Result.failure(new ValidationError("Logo uploads are not available."));
      try {
        logo = await this.logos.normalise(logo);
      } catch (error) {
        return Result.failure(new ValidationError(error instanceof Error ? error.message : "Invalid logo."));
      }
    }
    const contact = {
      website: input.website?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
    };
    const empty = !input.displayName.trim() && !input.accent && !logo && !Object.values(contact).some(Boolean);
    studio.setBranding(
      empty ? undefined : { displayName: input.displayName.trim(), accent: input.accent, logo, ...contact },
    );
    await this.studios.save(studio);
    return this.overview(studioId);
  }

  /** Fonts, layout, theme, section names, social links and watermark of the client galleries (Studio Pro). */
  async setClientStyle(
    studioId: string,
    role: string | undefined,
    style: ClientStyle,
  ): Promise<Result<StudioOverview, ApplicationError>> {
    if (role !== undefined && role !== "OWNER") {
      return Result.failure(new ForbiddenError("Only the studio owner can change its branding."));
    }
    const id = UniqueEntityId.create(studioId);
    const [studio, subscription] = await Promise.all([
      this.studios.findById(id),
      this.subscriptions.findByStudioId(id),
    ]);
    if (!studio || !subscription) return Result.failure(new NotFoundError("Studio", studioId));
    if (!subscription.plan.whiteLabelReview) {
      return Result.failure(new ConflictError("Your own branding on client pages comes with the Studio Pro plan."));
    }
    studio.setClientStyle(style);
    await this.studios.save(studio);
    return this.overview(studioId);
  }

  async removeMember(studioId: string, memberId: string): Promise<Result<null, ApplicationError>> {
    const member = await this.members.findById(UniqueEntityId.create(memberId));
    if (!member || member.studioId.toString() !== studioId) {
      return Result.failure(new NotFoundError("Member", memberId));
    }
    if (member.role === "OWNER") {
      return Result.failure(new ConflictError("The studio owner cannot be removed."));
    }
    await this.members.remove(member.id);
    return Result.success(null);
  }
}

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
