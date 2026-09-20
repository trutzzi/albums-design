import { signJwt, verifyJwt } from "../../shared-kernel/jwt";

const AUDIENCE = "media";

/**
 * Mints and checks the short-lived URLs that stand in for presigned links on a
 * backend that has none (WebDAV). The token is a JWT signed with a key derived
 * from — but not equal to — the login secret, and carries an audience claim,
 * so a login token can never be replayed as a media URL or the reverse.
 */
export class MediaUrlSigner {
  private readonly secret: string;

  constructor(
    baseSecret: string,
    /** Public origin of this API, e.g. https://api.valentintruta.ro */
    private readonly publicBaseUrl: string,
  ) {
    this.secret = `${baseSecret}:media-url`;
  }

  sign(key: string, expiresInSeconds: number): string {
    const token = signJwt({ sub: key, aud: AUDIENCE }, this.secret, expiresInSeconds);
    return `${this.publicBaseUrl.replace(/\/+$/, "")}/media/${token}`;
  }

  /** The storage key the token grants read access to, or `undefined` if forged, expired or misdirected. */
  verify(token: string): string | undefined {
    const payload = verifyJwt(token, this.secret);
    if (!payload || payload["aud"] !== AUDIENCE) return undefined;
    return payload.sub;
  }
}
