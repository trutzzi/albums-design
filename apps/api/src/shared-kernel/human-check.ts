/** Tells a person from a signup bot before an account is created. */
export interface HumanCheck {
  readonly enabled: boolean;
  verify(token: string | undefined, ip: string | undefined): Promise<boolean>;
}

/** No check configured: every request passes, as before the check existed. */
export class NoHumanCheck implements HumanCheck {
  readonly enabled = false;
  async verify(): Promise<boolean> {
    return true;
  }
}

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile: the widget on the signup form hands the browser a one-time token,
 * and Cloudflare confirms it here. Usually invisible to people, a wall for scripts.
 */
export class TurnstileHumanCheck implements HumanCheck {
  readonly enabled = true;

  constructor(
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly log: (message: string) => void = console.error,
  ) {}

  async verify(token: string | undefined, ip: string | undefined): Promise<boolean> {
    if (!token) return false;
    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (ip) body.set("remoteip", ip);
    try {
      const response = await this.fetchImpl(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(8000) });
      const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
      if (!result.success) this.log(`[signup] human check failed: ${(result["error-codes"] ?? []).join(", ") || "no reason given"}`);
      return result.success === true;
    } catch (error) {
      // Cloudflare unreachable: better to let a person in than to lock out every signup.
      this.log(`[signup] human check unavailable, allowing: ${error instanceof Error ? error.message : error}`);
      return true;
    }
  }
}
