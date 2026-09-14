import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { planFor, type Plan, type PlanCode } from "./plan";

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

export interface SubscriptionProps {
  studioId: UniqueEntityId;
  planCode: PlanCode;
  status: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date;
  albumsUsed: number;
  externalCustomerId: string | undefined;
  externalSubscriptionId: string | undefined;
}

export class Subscription extends AggregateRoot<SubscriptionProps> {
  private constructor(props: SubscriptionProps, id: UniqueEntityId) {
    super(props, id);
  }

  static startTrial(studioId: UniqueEntityId, id?: UniqueEntityId): Subscription {
    const now = new Date();
    return new Subscription(
      {
        studioId,
        planCode: "TRIAL",
        status: "TRIALING",
        periodStart: now,
        periodEnd: addMonth(now),
        albumsUsed: 0,
        externalCustomerId: undefined,
        externalSubscriptionId: undefined,
      },
      id ?? UniqueEntityId.create(),
    );
  }

  static reconstitute(props: SubscriptionProps, id: UniqueEntityId): Subscription {
    return new Subscription(props, id);
  }

  get studioId(): UniqueEntityId {
    return this.props.studioId;
  }

  get planCode(): PlanCode {
    return this.props.planCode;
  }

  get plan(): Plan {
    return planFor(this.props.planCode);
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }

  get periodStart(): Date {
    return this.props.periodStart;
  }

  get periodEnd(): Date {
    return this.props.periodEnd;
  }

  get albumsUsed(): number {
    return this.props.albumsUsed;
  }

  get externalCustomerId(): string | undefined {
    return this.props.externalCustomerId;
  }

  get externalSubscriptionId(): string | undefined {
    return this.props.externalSubscriptionId;
  }

  get albumsRemaining(): number {
    return Math.max(0, this.plan.albumsPerPeriod - this.props.albumsUsed);
  }

  /**
   * Rolling the period on read means a studio that goes quiet for two months still
   * gets a fresh allowance the moment it comes back, without a scheduled job.
   */
  rollPeriodIfElapsed(now: Date = new Date()): void {
    while (now > this.props.periodEnd) {
      this.props.periodStart = this.props.periodEnd;
      this.props.periodEnd = addMonth(this.props.periodEnd);
      this.props.albumsUsed = 0;
    }
  }

  canCreateAlbum(now: Date = new Date()): { allowed: boolean; reason?: string } {
    this.rollPeriodIfElapsed(now);
    if (this.props.status === "CANCELLED") {
      return { allowed: false, reason: "This subscription is cancelled. Reactivate to keep going." };
    }
    if (this.props.status === "PAST_DUE") {
      return { allowed: false, reason: "Payment failed — update your card to generate albums." };
    }
    if (this.props.albumsUsed >= this.plan.albumsPerPeriod) {
      return {
        allowed: false,
        reason: `The ${this.plan.name} plan covers ${this.plan.albumsPerPeriod} albums per month. Upgrade or buy an overage pack.`,
      };
    }
    return { allowed: true };
  }

  recordAlbumCreated(now: Date = new Date()): void {
    this.rollPeriodIfElapsed(now);
    this.props.albumsUsed += 1;
  }

  changePlan(planCode: PlanCode): void {
    this.props.planCode = planCode;
    if (this.props.status === "TRIALING") this.props.status = "ACTIVE";
  }

  linkExternal(params: { customerId: string; subscriptionId: string }): void {
    this.props.externalCustomerId = params.customerId;
    this.props.externalSubscriptionId = params.subscriptionId;
  }

  markPastDue(): void {
    this.props.status = "PAST_DUE";
  }

  markActive(): void {
    this.props.status = "ACTIVE";
  }

  cancel(): void {
    this.props.status = "CANCELLED";
  }

  seatsRemaining(currentMembers: number): number {
    return Math.max(0, this.plan.seats - currentMembers);
  }
}

function addMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}
