import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { AttemptLimiter } from "#src/shared-kernel/attempt-limiter";
import {
  ConflictError,
  TooManyAttemptsError,
  UnauthorizedError,
  ValidationError,
  type ApplicationError,
} from "#src/shared-kernel/errors";
import { hashPassword } from "#src/shared-kernel/password-hasher";
import { signJwt, verifyJwt } from "#src/shared-kernel/jwt";
import type { StudioMemberRepository, StudioRepository, SubscriptionRepository } from "../../domain/repositories";
import { Studio } from "../../domain/studio";
import { StudioMember } from "../../domain/studio-member";
import { Subscription } from "../../domain/subscription";
import type { EmailConfirmationMailer } from "../services/email-confirmation.mailer";
import type { ResetLanguage } from "../services/password-reset.mailer";
import { issueSession } from "./login.use-case";

const MIN_PASSWORD_LENGTH = 8;
const CONFIRM_TTL_SECONDS = 60 * 60 * 48; // 48 hours
const PURPOSE = "email-confirmation";
const INVALID_LINK = "This confirmation link is invalid or has expired. Sign in to get a new one.";

export interface SignUpOutcome {
  /** The account exists but cannot sign in until the emailed link is opened. */
  status: "CONFIRMATION_SENT";
  email: string;
}

/**
 * Self-serve signup: one person, one personal studio (a Studio, its default
 * Subscription and an OWNER member with the password they chose). The account stays
 * locked until its owner opens the link emailed to them, so a bot typing someone
 * else's address — or nonsense — never gets a working account out of it.
 */
export class RegisterUseCase {
  constructor(
    private readonly studios: StudioRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly members: StudioMemberRepository,
    private readonly jwtSecret: string,
    private readonly mailer: EmailConfirmationMailer,
    private readonly webOrigin: string,
    /** Signups per address per hour: a person makes one or two, a script makes hundreds. */
    private readonly perIp: AttemptLimiter = new AttemptLimiter(5, 60 * 60 * 1000),
    /** Confirmation emails per inbox per hour, so the form cannot flood someone. */
    private readonly perEmail: AttemptLimiter = new AttemptLimiter(4, 60 * 60 * 1000),
  ) {}

  async execute(params: {
    name: string;
    email: string;
    password: string;
    language?: ResetLanguage | undefined;
    ip?: string | undefined;
  }): Promise<Result<SignUpOutcome, ApplicationError>> {
    const email = params.email.trim().toLowerCase();
    if (params.password.length < MIN_PASSWORD_LENGTH) {
      return Result.failure(new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`));
    }

    const ipKey = params.ip ? `signup-ip:${params.ip}` : undefined;
    const locked = ipKey ? this.perIp.lockedFor(ipKey) : 0;
    if (locked > 0) return Result.failure(new TooManyAttemptsError(locked));
    if (ipKey) this.perIp.recordFailure(ipKey);

    const existing = await this.members.findByEmail(email);
    if (existing?.emailVerified || (existing && !existing.passwordHash)) {
      return Result.failure(new ConflictError(`${email} is already registered.`));
    }

    const passwordHash = await hashPassword(params.password);
    let member: StudioMember;
    if (existing) {
      // Never confirmed: whoever signs up with the address now may be its real owner.
      // They still have to open the new link, so nobody gets in without the mailbox.
      existing.restartSignUp({ name: params.name, passwordHash });
      member = existing;
    } else {
      const { studio } = Studio.create({ name: params.name, ownerEmail: email });
      member = StudioMember.signUp({ studioId: studio.id, email, name: params.name, passwordHash });
      await this.studios.save(studio);
      await this.subscriptions.save(Subscription.startDefault(studio.id));
    }
    await this.members.save(member);
    await this.sendConfirmation(member, params.language ?? "en");
    return Result.success({ status: "CONFIRMATION_SENT", email });
  }

  /** Opens the account and signs straight in. */
  async confirm(token: string): Promise<Result<{ token: string; studioId: string; name: string }, ApplicationError>> {
    const payload = verifyJwt(token, this.jwtSecret);
    if (!payload || payload["purpose"] !== PURPOSE) return Result.failure(new UnauthorizedError(INVALID_LINK));
    const member = await this.members.findById(UniqueEntityId.create(payload.sub));
    if (!member) return Result.failure(new UnauthorizedError(INVALID_LINK));
    member.markEmailVerified();
    await this.members.save(member);
    this.perEmail.reset(`confirm:${member.email}`);
    return Result.success(issueSession(member, this.jwtSecret));
  }

  /** Always quiet: it never says whether the address has an account. */
  async resend(params: { email: string; language: ResetLanguage }): Promise<void> {
    const member = await this.members.findByEmail(params.email.trim().toLowerCase());
    if (!member || member.emailVerified || !member.passwordHash) return;
    await this.sendConfirmation(member, params.language);
  }

  private async sendConfirmation(member: StudioMember, language: ResetLanguage): Promise<void> {
    const key = `confirm:${member.email}`;
    if (this.perEmail.lockedFor(key) > 0) return;
    this.perEmail.recordFailure(key);
    const token = signJwt({ sub: member.id.toString(), purpose: PURPOSE }, this.jwtSecret, CONFIRM_TTL_SECONDS);
    await this.mailer.send({
      to: member.email,
      name: member.name,
      url: `${this.webOrigin.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`,
      language,
      expiresInHours: CONFIRM_TTL_SECONDS / 3600,
    });
  }
}
