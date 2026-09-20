import { signJwt, verifyJwt } from "./jwt";

export type GrantKind = "review" | "download" | "pick";

const GRANT_TTL_SECONDS = 12 * 60 * 60;

/**
 * What a client holds after entering the right password: a short-lived signed
 * note saying "this browser unlocked link X". It is bound to one link and one
 * kind, so a grant for an album review cannot open a download, and it can be
 * revoked implicitly by revoking the link.
 */
export class ClientGrantSigner {
  private readonly secret: string;

  constructor(jwtSecret: string) {
    this.secret = `${jwtSecret}:client-grant`;
  }

  sign(kind: GrantKind, sessionId: string): string {
    return signJwt({ sub: `${kind}:${sessionId}`, aud: "client-grant" }, this.secret, GRANT_TTL_SECONDS);
  }

  verify(grant: string | undefined, kind: GrantKind, sessionId: string): boolean {
    if (!grant) return false;
    const payload = verifyJwt(grant, this.secret);
    return payload?.["aud"] === "client-grant" && payload.sub === `${kind}:${sessionId}`;
  }
}
