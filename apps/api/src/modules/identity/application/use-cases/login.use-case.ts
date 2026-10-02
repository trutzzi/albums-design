import { Result } from "@albumflow/domain-kernel";
import { AttemptLimiter } from "#src/shared-kernel/attempt-limiter";
import {
  EmailNotVerifiedError,
  TooManyAttemptsError,
  UnauthorizedError,
  type ApplicationError,
} from "#src/shared-kernel/errors";
import { verifyPassword } from "#src/shared-kernel/password-hasher";
import { signJwt } from "#src/shared-kernel/jwt";
import type { StudioMemberRepository } from "../../domain/repositories";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** Same message either way — confirming "that email isn't registered" versus
 * "that password is wrong" is exactly the distinction a credential-stuffing
 * attacker wants handed to them for free. */
const INVALID_CREDENTIALS = "Incorrect email or password.";

/**
 * Two locks, because they stop different attacks: one account guessed from many
 * addresses (the email lock), and many accounts sprayed from one address (the IP
 * lock, looser so a studio sharing one office connection is never caught by it).
 */
export function defaultLoginLimiters() {
  return { perEmail: new AttemptLimiter(8), perIp: new AttemptLimiter(40) };
}

export class LoginUseCase {
  constructor(
    private readonly members: StudioMemberRepository,
    private readonly jwtSecret: string,
    private readonly limiters = defaultLoginLimiters(),
  ) {}

  async execute(params: {
    email: string;
    password: string;
    /** The caller's address, when the transport knows it. */
    ip?: string | undefined;
  }): Promise<Result<{ token: string; studioId: string; name: string }, ApplicationError>> {
    const email = params.email.trim().toLowerCase();
    const emailKey = `login:${email}`;
    const ipKey = params.ip ? `login-ip:${params.ip}` : undefined;
    const locked = Math.max(
      this.limiters.perEmail.lockedFor(emailKey),
      ipKey ? this.limiters.perIp.lockedFor(ipKey) : 0,
    );
    if (locked > 0) return Result.failure(new TooManyAttemptsError(locked));

    const member = await this.members.findByEmail(email);
    const valid = member?.passwordHash ? await verifyPassword(params.password, member.passwordHash) : false;
    if (!member || !valid) {
      this.limiters.perEmail.recordFailure(emailKey);
      if (ipKey) this.limiters.perIp.recordFailure(ipKey);
      return Result.failure(new UnauthorizedError(INVALID_CREDENTIALS));
    }
    this.limiters.perEmail.reset(emailKey);
    // Only after the password checked out, so this reveals nothing to a guesser.
    if (!member.emailVerified) return Result.failure(new EmailNotVerifiedError());

    return Result.success(issueSession(member, this.jwtSecret));
  }
}

/** The login token every way in hands out: logging in, signing up, resetting a password. */
export function issueSession(
  member: { id: { toString(): string }; studioId: { toString(): string }; role: string; name: string },
  jwtSecret: string,
): { token: string; studioId: string; name: string } {
  const token = signJwt(
    { sub: member.id.toString(), studioId: member.studioId.toString(), role: member.role },
    jwtSecret,
    TOKEN_TTL_SECONDS,
  );
  return { token, studioId: member.studioId.toString(), name: member.name };
}
