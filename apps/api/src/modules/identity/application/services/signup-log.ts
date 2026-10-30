import { randomUUID } from "node:crypto";
import { Result } from "@albumflow/domain-kernel";
import { AttemptLimiter } from "#src/shared-kernel/attempt-limiter";
import { NotFoundError, ValidationError, type ApplicationError } from "#src/shared-kernel/errors";
import type { Logger } from "#src/shared-kernel/logger";
import {
  PUBLIC_MAIL_DOMAINS,
  matchingBlock,
  normaliseBlock,
  networkOf,
  type SignupAttemptFilter,
  type SignupAttemptRepository,
  type SignupBlock,
  type SignupBlockKind,
  type SignupBlockRepository,
  type SignupContext,
  type SignupOutcome,
} from "../../domain/signup-log";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Long enough to see a pattern across weeks; short enough to be a fair use of people's IPs. */
export const SIGNUP_LOG_RETENTION_DAYS = 90;
/** An emailed link not opened in this long never will be (it expires then, too). */
const CONFIRM_WINDOW_MS = 2 * DAY_MS;
/**
 * Refused attempts kept per network (an IP's /24 or /64) per hour. Past this a bot's
 * hammering is already plain from what was kept, and the table must not grow as fast
 * as it can post — or as fast as it can rotate through its neighbours' addresses.
 */
export const REFUSED_ROWS_PER_IP_PER_HOUR = 30;

export interface SignupAttemptView {
  id: string;
  at: string;
  email: string;
  ip: string | null;
  network: string | null;
  userAgent: string | null;
  language: string | null;
  referer: string | null;
  outcome: SignupOutcome;
  /** For an emailed link: opened, still waiting, or never opened in time. */
  confirmation: "CONFIRMED" | "WAITING" | "NEVER" | null;
}

export interface SignupBlockView {
  id: string;
  kind: SignupBlockKind;
  value: string;
  note: string | null;
  createdAt: string;
}

const clip = (value: string | undefined, length: number) => (value ? value.slice(0, length) : null);

/**
 * The sign-up log and the block list. Sign-up asks it whether an attempt is blocked and
 * tells it how each attempt ended; the admin page reads and prunes it. Recording is best
 * effort: a sign-up never fails because its log entry could not be written.
 */
export class SignupLog {
  constructor(
    private readonly attempts: SignupAttemptRepository,
    private readonly blocks: SignupBlockRepository,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
    private readonly refusedPerIp = new AttemptLimiter(REFUSED_ROWS_PER_IP_PER_HOUR, 60 * 60 * 1000),
  ) {}

  /** The block this attempt falls under, if any. Never throws: an unreadable list blocks nobody. */
  async blockFor(email: string, context: SignupContext): Promise<SignupBlock | null> {
    try {
      return matchingBlock(await this.blocks.list(), context.ip, email);
    } catch (error) {
      this.logger.error("sign-up block list could not be read", { err: error });
      return null;
    }
  }

  async record(email: string, context: SignupContext, outcome: SignupOutcome, memberId?: string): Promise<void> {
    // A link actually sent is always kept (sign-up limits those already); refusals are capped.
    if (outcome !== "CONFIRMATION_SENT") {
      // No address at all (a proxy that dropped it) shares one budget rather than none.
      const key = `refused:${context.ip ? networkOf(context.ip) : "unknown"}`;
      if (this.refusedPerIp.lockedFor(key) > 0) return;
      this.refusedPerIp.record(key);
    }
    try {
      await this.attempts.record({
        id: randomUUID(),
        at: this.now(),
        email: email.trim().toLowerCase().slice(0, 320),
        ip: clip(context.ip, 64),
        userAgent: clip(context.userAgent, 512),
        language: clip(context.language, 128),
        referer: clip(context.referer, 512),
        outcome,
        memberId: memberId ?? null,
        confirmedAt: null,
      });
    } catch (error) {
      this.logger.error("sign-up attempt not logged", { outcome, err: error });
    }
  }

  async confirmed(memberId: string): Promise<void> {
    try {
      await this.attempts.markConfirmed(memberId, this.now());
    } catch (error) {
      this.logger.error("sign-up confirmation not logged", { memberId, err: error });
    }
  }

  async list(filter: SignupAttemptFilter): Promise<{
    items: SignupAttemptView[];
    total: number;
    /** Each outcome over the last 30 days, for the summary above the list. */
    last30Days: Partial<Record<SignupOutcome, number>>;
  }> {
    const now = this.now();
    const [page, last30Days] = await Promise.all([
      this.attempts.list(filter),
      this.attempts.countByOutcome(new Date(now.getTime() - 30 * DAY_MS)),
    ]);
    return {
      total: page.total,
      last30Days,
      items: page.items.map((item) => ({
        id: item.id,
        at: item.at.toISOString(),
        email: item.email,
        ip: item.ip,
        network: item.ip ? networkOf(item.ip) : null,
        userAgent: item.userAgent,
        language: item.language,
        referer: item.referer,
        outcome: item.outcome,
        confirmation:
          item.outcome !== "CONFIRMATION_SENT"
            ? null
            : item.confirmedAt
              ? "CONFIRMED"
              : now.getTime() - item.at.getTime() > CONFIRM_WINDOW_MS
                ? "NEVER"
                : "WAITING",
      })),
    };
  }

  async listBlocks(): Promise<SignupBlockView[]> {
    return (await this.blocks.list()).map((block) => ({ ...block, createdAt: block.createdAt.toISOString() }));
  }

  async block(kind: SignupBlockKind, value: string, note?: string): Promise<Result<SignupBlockView, ApplicationError>> {
    const normalised = normaliseBlock(kind, value);
    if (!normalised) {
      const expected =
        kind === "EMAIL_DOMAIN"
          ? "a domain like spam.example"
          : kind === "IP"
            ? "one IP address"
            : "an IP address, or its /24 (IPv4) or /64 (IPv6)";
      return Result.failure(new ValidationError(`"${value}" can't be blocked as ${kind}: expected ${expected}.`));
    }
    if (kind === "EMAIL_DOMAIN" && PUBLIC_MAIL_DOMAINS.has(normalised)) {
      return Result.failure(
        new ValidationError(`${normalised} is used by too many real people to block; block the IP or network instead.`),
      );
    }
    const existing = (await this.blocks.list()).find((block) => block.kind === kind && block.value === normalised);
    if (existing) return Result.success({ ...existing, createdAt: existing.createdAt.toISOString() });
    await this.blocks.add({
      id: randomUUID(),
      kind,
      value: normalised,
      note: note?.trim() || null,
      createdAt: this.now(),
    });
    // Read back what was stored: if another admin added the same block a moment earlier,
    // theirs is the one that exists, and its id is the one that can be unblocked.
    const stored = (await this.blocks.list()).find((block) => block.kind === kind && block.value === normalised)!;
    return Result.success({ ...stored, createdAt: stored.createdAt.toISOString() });
  }

  async unblock(id: string): Promise<Result<void, ApplicationError>> {
    const exists = (await this.blocks.list()).some((block) => block.id === id);
    if (!exists) return Result.failure(new NotFoundError("Block", id));
    await this.blocks.remove(id);
    return Result.success(undefined);
  }

  async purgeExpired(): Promise<{ deleted: number }> {
    const cutoff = new Date(this.now().getTime() - SIGNUP_LOG_RETENTION_DAYS * DAY_MS);
    return { deleted: await this.attempts.deleteBefore(cutoff) };
  }
}
