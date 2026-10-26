/**
 * Stops someone guessing a client password: after `maxFailures` wrong tries a
 * key is locked until the window passes. Held in memory, which is enough for a
 * single API process; a second instance would need this in Redis.
 */
/** How many keys are held before a write first clears out the expired ones. */
const SWEEP_FROM = 1000;

export class AttemptLimiter {
  private readonly failures = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly maxFailures = 8,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until another try is allowed, or 0 when the key is not locked. */
  lockedFor(key: string): number {
    const entry = this.live(key);
    if (!entry || entry.count < this.maxFailures) return 0;
    return Math.max(1, Math.ceil((entry.since + this.windowMs - this.now()) / 1000));
  }

  recordFailure(key: string): void {
    // Keys that are never seen again would otherwise stay forever; public forms key by address.
    if (this.failures.size >= SWEEP_FROM) this.sweep();
    const entry = this.live(key);
    if (entry) entry.count += 1;
    else this.failures.set(key, { count: 1, since: this.now() });
  }

  /** How many keys are held: lets a test see expired ones go. */
  get size(): number {
    return this.failures.size;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  /** Drops every entry whose window has passed. */
  private sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.failures) {
      if (now - entry.since >= this.windowMs) this.failures.delete(key);
    }
  }

  private live(key: string) {
    const entry = this.failures.get(key);
    if (entry && this.now() - entry.since >= this.windowMs) {
      this.failures.delete(key);
      return undefined;
    }
    return entry;
  }
}
