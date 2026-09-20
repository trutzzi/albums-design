import { Result, type UniqueEntityId } from "@albumflow/domain-kernel";
import { generateAccessPassword, normalizeAccessPassword } from "../../../../shared-kernel/access-code";
import { AttemptLimiter } from "../../../../shared-kernel/attempt-limiter";
import type { ClientGrantSigner, GrantKind } from "../../../../shared-kernel/client-grant";
import {
  InvalidPasswordError,
  PasswordRequiredError,
  TooManyAttemptsError,
  type ApplicationError,
} from "../../../../shared-kernel/errors";
import { hashPassword, verifyPassword } from "../../../../shared-kernel/password-hasher";
import type { SecretBox } from "../../../../shared-kernel/secret-box";

/** Anything a client can be given a link to that may be password protected. */
export interface ProtectedLink {
  readonly id: UniqueEntityId;
  readonly passwordHash: string | undefined;
  readonly sealedSecret: string | undefined;
}

/**
 * Passwords for client links. A new link gets a generated password; what is
 * stored is (a) a hash, which is what the password is checked against, and (b)
 * an encrypted copy of the link token and password, so the studio can look both
 * up again later. Links created before this existed have neither and stay open.
 */
export class ClientAccessService {
  constructor(
    private readonly box: SecretBox,
    private readonly grants: ClientGrantSigner,
    private readonly limiter: AttemptLimiter = new AttemptLimiter(),
  ) {}

  async issue(token: string): Promise<{ password: string; passwordHash: string; sealedSecret: string }> {
    const password = generateAccessPassword();
    return {
      password,
      passwordHash: await hashPassword(normalizeAccessPassword(password)),
      sealedSecret: this.box.seal(JSON.stringify({ token, password })),
    };
  }

  /** What the studio sees in the details window. `undefined` for a link that has no stored secret. */
  reveal(link: ProtectedLink): { token: string; password: string } | undefined {
    if (!link.sealedSecret) return undefined;
    const opened = this.box.open(link.sealedSecret);
    if (!opened) return undefined;
    try {
      const parsed = JSON.parse(opened) as { token?: string; password?: string };
      return parsed.token && parsed.password ? { token: parsed.token, password: parsed.password } : undefined;
    } catch {
      return undefined;
    }
  }

  requiresPassword(link: ProtectedLink): boolean {
    return Boolean(link.passwordHash);
  }

  /** Fails with PASSWORD_REQUIRED unless the link is open or the caller holds a valid grant for it. */
  authorize(kind: GrantKind, link: ProtectedLink, grant: string | undefined): Result<void, ApplicationError> {
    if (!this.requiresPassword(link)) return Result.success(undefined);
    return this.grants.verify(grant, kind, link.id.toString())
      ? Result.success(undefined)
      : Result.failure(new PasswordRequiredError());
  }

  async unlock(kind: GrantKind, link: ProtectedLink, password: string): Promise<Result<string, ApplicationError>> {
    const id = link.id.toString();
    if (!this.requiresPassword(link)) return Result.success(this.grants.sign(kind, id));

    const key = `${kind}:${id}`;
    const locked = this.limiter.lockedFor(key);
    if (locked > 0) return Result.failure(new TooManyAttemptsError(locked));

    if (await verifyPassword(normalizeAccessPassword(password), link.passwordHash!)) {
      this.limiter.reset(key);
      return Result.success(this.grants.sign(kind, id));
    }
    this.limiter.recordFailure(key);
    return Result.failure(new InvalidPasswordError());
  }
}
