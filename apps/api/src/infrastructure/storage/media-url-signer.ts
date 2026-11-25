import { signJwt, verifyJwt } from "../../shared-kernel/jwt";

const AUDIENCE = "media";

/**
 * Links are issued per window of this length: every request for the same photo inside one
 * window gets the very same URL. A link signed with the current second was new on every
 * page load, so the browser could never reuse a preview it already had, and each reload
 * of the gallery or the editor fetched every preview again from DigiStorage.
 */
export const MEDIA_URL_WINDOW_SECONDS = 60 * 60;

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
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.secret = `${baseSecret}:media-url`;
  }

  /**
   * A URL valid for at least `expiresInSeconds`. Links meant to last a window or more (every
   * preview and thumbnail) are identical for the same key within one window, at the cost of
   * living up to one window longer than asked. A shorter link is signed exactly as asked.
   */
  sign(key: string, expiresInSeconds: number): string {
    const now = this.nowSeconds();
    if (expiresInSeconds < MEDIA_URL_WINDOW_SECONDS) {
      return this.url(signJwt({ sub: key, aud: AUDIENCE }, this.secret, expiresInSeconds, now));
    }
    const windowStart = Math.floor(now / MEDIA_URL_WINDOW_SECONDS) * MEDIA_URL_WINDOW_SECONDS;
    // Issued at the window's start, so it must last one window longer to still give the
    // caller its full lifetime from now.
    const token = signJwt(
      { sub: key, aud: AUDIENCE },
      this.secret,
      expiresInSeconds + MEDIA_URL_WINDOW_SECONDS,
      windowStart,
    );
    return this.url(token);
  }

  private url(token: string): string {
    return `${this.publicBaseUrl.replace(/\/+$/, "")}/media/${token}`;
  }

  /** The storage key the token grants read access to, or `undefined` if forged, expired or misdirected. */
  verify(token: string): string | undefined {
    return this.inspect(token)?.key;
  }

  /** The key and how many seconds the link stays valid; `undefined` if forged, expired or misdirected. */
  inspect(token: string): { key: string; secondsLeft: number } | undefined {
    const payload = verifyJwt(token, this.secret);
    if (!payload || payload["aud"] !== AUDIENCE || typeof payload.sub !== "string") return undefined;
    const exp = typeof payload["exp"] === "number" ? payload["exp"] : this.nowSeconds();
    return { key: payload.sub, secondsLeft: Math.max(0, exp - this.nowSeconds()) };
  }
}
