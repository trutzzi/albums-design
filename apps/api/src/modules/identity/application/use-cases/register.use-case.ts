import { Result } from "@albumflow/domain-kernel";
import { ConflictError, ValidationError, type ApplicationError } from "../../../../shared-kernel/errors";
import { hashPassword } from "../../../../shared-kernel/password-hasher";
import { signJwt } from "../../../../shared-kernel/jwt";
import type {
  StudioMemberRepository,
  StudioRepository,
  SubscriptionRepository,
} from "../../domain/repositories";
import { Studio } from "../../domain/studio";
import { StudioMember } from "../../domain/studio-member";
import { Subscription } from "../../domain/subscription";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MIN_PASSWORD_LENGTH = 8;

/**
 * Self-serve signup: one person, one personal studio. It's the existing
 * onboarding flow (create a Studio, start a TRIAL Subscription, seat an OWNER
 * member) plus a password the person actually chose, rather than a bearer API
 * key handed to them once. The studio the account gets is exactly the
 * tenancy boundary `registerTenancyGuard` already enforces everywhere else,
 * so "only I can see my photoshoots" falls out of the existing multi-tenant
 * isolation for free — nothing about Project/Album scoping has to change.
 */
export class RegisterUseCase {
  constructor(
    private readonly studios: StudioRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly members: StudioMemberRepository,
    private readonly jwtSecret: string,
  ) {}

  async execute(params: {
    name: string;
    email: string;
    password: string;
  }): Promise<Result<{ token: string; studioId: string }, ApplicationError>> {
    const email = params.email.trim().toLowerCase();
    if (params.password.length < MIN_PASSWORD_LENGTH) {
      return Result.failure(
        new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
      );
    }

    const existing = await this.members.findByEmail(email);
    if (existing) {
      return Result.failure(new ConflictError(`${email} is already registered.`));
    }

    const { studio } = Studio.create({ name: params.name, ownerEmail: email });
    const passwordHash = await hashPassword(params.password);
    const member = StudioMember.signUp({
      studioId: studio.id,
      email,
      name: params.name,
      passwordHash,
    });

    await this.studios.save(studio);
    await this.subscriptions.save(Subscription.startTrial(studio.id));
    await this.members.save(member);

    const token = signJwt(
      { sub: member.id.toString(), studioId: studio.id.toString(), role: member.role },
      this.jwtSecret,
      TOKEN_TTL_SECONDS,
    );
    return Result.success({ token, studioId: studio.id.toString() });
  }
}
