import { isIP, isIPv6 } from "node:net";
import { addressKey } from "#src/shared-kernel/address-key";

/**
 * Every attempt to open an account, kept for a while after the 48-hour purge of
 * unconfirmed accounts — that purge is what makes spam leave no trace otherwise.
 */
export type SignupOutcome =
  /** An account was made (or a stale unconfirmed one restarted) and the link emailed. */
  | "CONFIRMATION_SENT"
  /** The hidden field was filled in: a bot, answered as if it had worked. */
  | "TRAPPED"
  | "HUMAN_CHECK_FAILED"
  | "RATE_LIMITED"
  /** On the admin block list. */
  | "BLOCKED"
  | "ALREADY_REGISTERED"
  /** Refused before anything else, a too-short password say. */
  | "INVALID";

export interface SignupContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
  /** The browser's Accept-Language: bots often send none, or one that fits nobody. */
  language?: string | undefined;
  /** The page the form was posted from, when the browser says. */
  referer?: string | undefined;
}

export interface SignupAttempt {
  id: string;
  at: Date;
  email: string;
  ip: string | null;
  userAgent: string | null;
  language: string | null;
  referer: string | null;
  outcome: SignupOutcome;
  /** The account the attempt made, so confirming it can be recorded against the attempt. */
  memberId: string | null;
  confirmedAt: Date | null;
}

export interface SignupAttemptFilter {
  outcome?: SignupOutcome | undefined;
  /** Part of an email address or an IP. */
  search?: string | undefined;
  page: number;
  pageSize: number;
}

export interface SignupAttemptRepository {
  record(attempt: SignupAttempt): Promise<void>;
  markConfirmed(memberId: string, at: Date): Promise<void>;
  list(filter: SignupAttemptFilter): Promise<{ items: SignupAttempt[]; total: number }>;
  /** How many attempts ended each way since `since`, for the summary above the list. */
  countByOutcome(since: Date): Promise<Partial<Record<SignupOutcome, number>>>;
  deleteBefore(cutoff: Date): Promise<number>;
}

export type SignupBlockKind = "IP" | "NETWORK" | "EMAIL_DOMAIN";

export interface SignupBlock {
  id: string;
  kind: SignupBlockKind;
  /** "203.0.113.7", "203.0.113.0/24" or "2001:db8:1:2::/64", "spam.example". */
  value: string;
  note: string | null;
  createdAt: Date;
}

export interface SignupBlockRepository {
  list(): Promise<SignupBlock[]>;
  add(block: SignupBlock): Promise<void>;
  remove(id: string): Promise<void>;
}

/** The network an address belongs to: its /24 for IPv4, its /64 for IPv6 (one home or phone line). */
export function networkOf(ip: string): string {
  const key = addressKey(ip);
  if (isIPv6(ip) && key.endsWith("/64")) return key;
  const parts = key.split(".");
  return parts.length === 4 ? `${parts.slice(0, 3).join(".")}.0/24` : key;
}

export function emailDomainOf(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

/**
 * Mail providers whole countries use: blocking one would refuse every real photographer
 * on it too, so only an address or a network can be blocked for these.
 */
export const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.ro",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "zoho.com",
]);

/**
 * What the admin typed, in the form the matching compares — or null when it could never
 * match: not an address, or a network size other than the one networks are matched at
 * (/24 for IPv4, /64 for IPv6), which would silently block more or less than it says.
 */
export function normaliseBlock(kind: SignupBlockKind, value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (kind === "EMAIL_DOMAIN") {
    const domain = trimmed.replace(/^@/, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
  }
  const [address = "", prefix] = trimmed.split("/");
  if (!isIP(address)) return null;
  if (kind === "IP") return prefix === undefined ? addressKey(address) : null;
  const expected = isIPv6(address) && !address.startsWith("::ffff:") ? "64" : "24";
  return prefix === undefined || prefix === expected ? networkOf(address) : null;
}

/** The block an attempt falls under, if any. A subdomain of a blocked domain is blocked too. */
export function matchingBlock(
  blocks: readonly SignupBlock[],
  ip: string | undefined,
  email: string,
): SignupBlock | null {
  const domain = emailDomainOf(email);
  const address = ip ? addressKey(ip) : null;
  const network = ip ? networkOf(ip) : null;
  return (
    blocks.find(
      (block) =>
        (block.kind === "IP" && block.value === address) ||
        (block.kind === "NETWORK" && block.value === network) ||
        (block.kind === "EMAIL_DOMAIN" && (domain === block.value || domain.endsWith(`.${block.value}`))),
    ) ?? null
  );
}
