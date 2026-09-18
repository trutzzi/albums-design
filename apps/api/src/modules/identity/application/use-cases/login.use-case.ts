import { Result } from "@albumflow/domain-kernel";
import { UnauthorizedError, type ApplicationError } from "../../../../shared-kernel/errors";
import { verifyPassword } from "../../../../shared-kernel/password-hasher";
import { signJwt } from "../../../../shared-kernel/jwt";
import type { StudioMemberRepository } from "../../domain/repositories";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** Same message either way — confirming "that email isn't registered" versus
 * "that password is wrong" is exactly the distinction a credential-stuffing
 * attacker wants handed to them for free. */
const INVALID_CREDENTIALS = "Incorrect email or password.";

export class LoginUseCase {
  constructor(
    private readonly members: StudioMemberRepository,
    private readonly jwtSecret: string,
  ) {}

  async execute(params: {
    email: string;
    password: string;
  }): Promise<Result<{ token: string; studioId: string }, ApplicationError>> {
    const email = params.email.trim().toLowerCase();
    const member = await this.members.findByEmail(email);
    if (!member || !member.passwordHash) {
      return Result.failure(new UnauthorizedError(INVALID_CREDENTIALS));
    }

    const valid = await verifyPassword(params.password, member.passwordHash);
    if (!valid) {
      return Result.failure(new UnauthorizedError(INVALID_CREDENTIALS));
    }

    const token = signJwt(
      { sub: member.id.toString(), studioId: member.studioId.toString(), role: member.role },
      this.jwtSecret,
      TOKEN_TTL_SECONDS,
    );
    return Result.success({ token, studioId: member.studioId.toString() });
  }
}
