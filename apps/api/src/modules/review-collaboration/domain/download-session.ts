import { randomBytes } from "node:crypto";
import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { hashToken } from "./review-session";

/** ACTIVE links can be used until they expire; REVOKED ones never work again. Expiry is a matter of time, not a stored status. */
export type DownloadStatus = "ACTIVE" | "REVOKED";

export interface DownloadSessionProps {
  projectId: UniqueEntityId;
  /** Only the hash is stored — the raw token exists once, in the share link. */
  tokenHash: string;
  clientName: string;
  status: DownloadStatus;
  expiresAt: Date;
  downloadCount: number;
  firstDownloadedAt: Date | undefined;
  lastDownloadedAt: Date | undefined;
  createdAt: Date;
  /** The address this link was last emailed to, and when — so a resend is a conscious choice. */
  lastSentTo?: string | undefined;
  lastSentAt?: Date | undefined;
  /** Hash of the client password. Absent on links created before passwords existed, which stay open. */
  passwordHash?: string | undefined;
  /** Encrypted link token + password, so the studio can view them again. */
  sealedSecret?: string | undefined;
}

export class DownloadUnavailableError extends Error {
  constructor(reason: "revoked" | "expired") {
    super(
      reason === "revoked"
        ? "This download link is no longer active. Ask your photographer for a new one."
        : "This download link has expired and the photos are no longer available. Ask your photographer for a new one.",
    );
    this.name = "DownloadUnavailableError";
  }
}

export const DEFAULT_DOWNLOAD_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class DownloadSession extends AggregateRoot<DownloadSessionProps> {
  private constructor(props: DownloadSessionProps, id: UniqueEntityId) {
    super(props, id);
  }

  /** Returns the raw token alongside the aggregate; it is never recoverable afterwards. */
  static open(
    params: { projectId: UniqueEntityId; clientName: string; ttlDays?: number },
    id?: UniqueEntityId,
  ): { session: DownloadSession; token: string } {
    const token = randomBytes(24).toString("base64url");
    const ttlDays = params.ttlDays ?? DEFAULT_DOWNLOAD_TTL_DAYS;
    const session = new DownloadSession(
      {
        projectId: params.projectId,
        tokenHash: hashToken(token),
        clientName: params.clientName,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
        downloadCount: 0,
        firstDownloadedAt: undefined,
        lastDownloadedAt: undefined,
        createdAt: new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
    return { session, token };
  }

  static reconstitute(props: DownloadSessionProps, id: UniqueEntityId): DownloadSession {
    return new DownloadSession(props, id);
  }

  get projectId(): UniqueEntityId {
    return this.props.projectId;
  }
  get tokenHash(): string {
    return this.props.tokenHash;
  }
  get clientName(): string {
    return this.props.clientName;
  }
  get status(): DownloadStatus {
    return this.props.status;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get downloadCount(): number {
    return this.props.downloadCount;
  }
  get firstDownloadedAt(): Date | undefined {
    return this.props.firstDownloadedAt;
  }
  get lastDownloadedAt(): Date | undefined {
    return this.props.lastDownloadedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get passwordHash(): string | undefined {
    return this.props.passwordHash;
  }
  get sealedSecret(): string | undefined {
    return this.props.sealedSecret;
  }

  /** Protect this link with a password (hash to check against, sealed copy for the studio to read back). */
  protectWith(access: { passwordHash: string; sealedSecret: string }): void {
    this.props.passwordHash = access.passwordHash;
    this.props.sealedSecret = access.sealedSecret;
  }

  isExpired(now: Date = new Date()): boolean {
    return now > this.props.expiresAt;
  }

  /** Usable right now: not revoked and not past its expiry. */
  isActive(now: Date = new Date()): boolean {
    return this.props.status === "ACTIVE" && !this.isExpired(now);
  }

  /** Whole days left, rounded up so "23 hours left" reads as 1 day rather than 0. */
  daysLeft(now: Date = new Date()): number {
    return Math.max(0, Math.ceil((this.props.expiresAt.getTime() - now.getTime()) / DAY_MS));
  }

  assertDownloadable(now: Date = new Date()): void {
    if (this.props.status === "REVOKED") throw new DownloadUnavailableError("revoked");
    if (this.isExpired(now)) throw new DownloadUnavailableError("expired");
  }

  /** Counted only once a download has fully finished, so an abandoned one is not a delivery. */
  recordDownload(now: Date = new Date()): void {
    this.props.downloadCount += 1;
    this.props.firstDownloadedAt ??= now;
    this.props.lastDownloadedAt = now;
  }

  get lastSentTo(): string | undefined {
    return this.props.lastSentTo;
  }

  get lastSentAt(): Date | undefined {
    return this.props.lastSentAt;
  }

  /** Notes that the link was emailed to the client. Nothing else about the link changes. */
  recordSent(to: string, at: Date = new Date()): void {
    this.props.lastSentTo = to;
    this.props.lastSentAt = at;
  }

  revoke(): void {
    this.props.status = "REVOKED";
  }
}
