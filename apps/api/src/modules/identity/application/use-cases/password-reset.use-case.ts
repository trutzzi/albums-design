import { createHash } from "node:crypto";
import { Result, UniqueEntityId } from "@albumflow/domain-kernel";
import { AttemptLimiter } from "../../../../shared-kernel/attempt-limiter";
import { UnauthorizedError, ValidationError, type ApplicationError } from "../../../../shared-kernel/errors";
import { signJwt, verifyJwt } from "../../../../shared-kernel/jwt";
import { hashPassword } from "../../../../shared-kernel/password-hasher";
import type { StudioMemberRepository } from "../../domain/repositories";
import type { PasswordResetMailer, ResetLanguage } from "../services/password-reset.mailer";
import { issueSession } from "./login.use-case";

const RESET_TTL_SECONDS = 60 * 60; // 1 hour
const MIN_PASSWORD_LENGTH = 8;
const PURPOSE = "password-reset";
const INVALID_LINK = "This reset link is invalid or has already been used. Ask for a new one.";

/**
 * Binds a reset token to the password it was issued against. The moment the
 * password changes the fingerprint no longer matches, so a link works once and
 * an older link dies as soon as a newer one is used — with nothing stored.
 */
function fingerprint(passwordHash: string | undefined): string {
  return createHash("sha256").update(passwordHash ?? "no-password").digest("base64url").slice(0, 22);
}

/**
 * "Forgot password" by email. The reset token is a short-lived signed token rather
 * than a database row: it names the member and the password it may replace, which is
 * everything the reset needs. It also lets an invited member who never had a password
 * set their first one, since proving the mailbox is exactly what an invitation needs.
 */
export class PasswordResetUseCase {
  constructor(
    private readonly members: StudioMemberRepository,
    private readonly mailer: PasswordResetMailer,
    private readonly jwtSecret: string,
    private readonly webOrigin: string,
    /** Caps reset emails per address, so the form cannot be used to flood someone's inbox. */
    private readonly limiter: AttemptLimiter = new AttemptLimiter(5, 60 * 60 * 1000),
  ) {}

  /**
   * Always succeeds, whether or not the address has an account: answering "no such
   * account" would tell anyone which photographers use AlbumFlow.
   */
  async request(params: { email: string; language: ResetLanguage }): Promise<void> {
    const email = params.email.trim().toLowerCase();
    const key = `reset:${email}`;
    if (this.limiter.lockedFor(key) > 0) return;
    this.limiter.recordFailure(key);

    const member = await this.members.findByEmail(email);
    if (!member) return;

    const token = signJwt(
      { sub: member.id.toString(), purpose: PURPOSE, pwd: fingerprint(member.passwordHash) },
      this.jwtSecret,
      RESET_TTL_SECONDS,
    );
    await this.mailer.send({
      to: member.email,
      name: member.name,
      url: `${this.webOrigin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`,
      language: params.language,
      expiresInMinutes: RESET_TTL_SECONDS / 60,
    });
  }

  /** Sets the new password and logs the member straight in. */
  async reset(params: {
    token: string;
    password: string;
  }): Promise<Result<{ token: string; studioId: string; name: string }, ApplicationError>> {
    if (params.password.length < MIN_PASSWORD_LENGTH) {
      return Result.failure(new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`));
    }

    const payload = verifyJwt(params.token, this.jwtSecret);
    if (!payload || payload["purpose"] !== PURPOSE || typeof payload["pwd"] !== "string") {
      return Result.failure(new UnauthorizedError(INVALID_LINK));
    }

    // `sub` is a member id this server signed, so it needs no further validation.
    const member = await this.members.findById(UniqueEntityId.create(payload.sub));
    if (!member || fingerprint(member.passwordHash) !== payload["pwd"]) {
      return Result.failure(new UnauthorizedError(INVALID_LINK));
    }

    member.setPassword(await hashPassword(params.password));
    // Opening the emailed link proves the mailbox just as a confirmation link would.
    member.markEmailVerified();
    await this.members.save(member);
    this.limiter.reset(`reset:${member.email}`);

    return Result.success(issueSession(member, this.jwtSecret));
  }
}
