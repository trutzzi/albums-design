import { randomBytes } from "node:crypto";
import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { hashToken } from "./review-session";

/** ACTIVE links play until they expire; REVOKED ones never work again. Expiry is a matter of time, not a stored status. */
export type SlideshowStatus = "ACTIVE" | "REVOKED";
/** Where the photos came from, so "Refresh photos" can ask the same place again. */
export type SlideshowSource = "PICKS" | "ALBUM" | "SHOOT";
export type SlideshowTransition = "FADE" | "NONE";

export interface SlideshowSettings {
  /** How long each photo stays on screen. */
  intervalSeconds: number;
  transition: SlideshowTransition;
}

export interface SlideshowSessionProps {
  projectId: UniqueEntityId;
  /** Only the hash is stored — the raw token exists once, in the share link. */
  tokenHash: string;
  clientName: string;
  status: SlideshowStatus;
  expiresAt: Date;
  source: SlideshowSource;
  /** The album an ALBUM slideshow follows. Not a foreign key: deleting the album must not break a link family already has. */
  albumId: string | undefined;
  /**
   * The photos, in the order they play — taken when the link is made, so a slideshow
   * already shared with family does not change under them while the album is re-laid out.
   */
  photoIds: string[];
  settings: SlideshowSettings;
  viewCount: number;
  lastViewedAt: Date | undefined;
  createdAt: Date;
  lastSentTo?: string | undefined;
  lastSentAt?: Date | undefined;
  /**
   * The link token, encrypted, so the studio can copy the link again. Slideshows have no
   * password: they are meant to be passed around the family.
   */
  sealedSecret?: string | undefined;
}

export class SlideshowUnavailableError extends Error {
  constructor(reason: "revoked" | "expired") {
    super(
      reason === "revoked"
        ? "This slideshow is no longer available. Ask your photographer for a new link."
        : "This slideshow link has expired. Ask your photographer for a new one.",
    );
    this.name = "SlideshowUnavailableError";
  }
}

export class InvalidSlideshowSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSlideshowSettingsError";
  }
}

/** A keepsake, not a delivery window — so much longer than a download link. */
export const DEFAULT_SLIDESHOW_TTL_DAYS = 180;
export const MIN_INTERVAL_SECONDS = 3;
export const MAX_INTERVAL_SECONDS = 15;
export const DEFAULT_SLIDESHOW_SETTINGS: SlideshowSettings = { intervalSeconds: 5, transition: "FADE" };
const DAY_MS = 24 * 60 * 60 * 1000;

function checkedSettings(settings: SlideshowSettings): SlideshowSettings {
  const { intervalSeconds } = settings;
  if (
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < MIN_INTERVAL_SECONDS ||
    intervalSeconds > MAX_INTERVAL_SECONDS
  ) {
    throw new InvalidSlideshowSettingsError(
      `Each photo shows for ${MIN_INTERVAL_SECONDS} to ${MAX_INTERVAL_SECONDS} seconds.`,
    );
  }
  return { intervalSeconds, transition: settings.transition };
}

export class SlideshowSession extends AggregateRoot<SlideshowSessionProps> {
  private constructor(props: SlideshowSessionProps, id: UniqueEntityId) {
    super(props, id);
  }

  /** Returns the raw token alongside the aggregate; it is never recoverable afterwards except through the sealed copy. */
  static open(
    params: {
      projectId: UniqueEntityId;
      clientName: string;
      source: SlideshowSource;
      albumId?: string | undefined;
      photoIds: string[];
      settings?: Partial<SlideshowSettings> | undefined;
      ttlDays?: number | undefined;
    },
    id?: UniqueEntityId,
  ): { session: SlideshowSession; token: string } {
    const token = randomBytes(24).toString("base64url");
    const ttlDays = params.ttlDays ?? DEFAULT_SLIDESHOW_TTL_DAYS;
    const session = new SlideshowSession(
      {
        projectId: params.projectId,
        tokenHash: hashToken(token),
        clientName: params.clientName,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
        source: params.source,
        albumId: params.source === "ALBUM" ? params.albumId : undefined,
        photoIds: [...params.photoIds],
        settings: checkedSettings({ ...DEFAULT_SLIDESHOW_SETTINGS, ...params.settings }),
        viewCount: 0,
        lastViewedAt: undefined,
        createdAt: new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
    return { session, token };
  }

  static reconstitute(props: SlideshowSessionProps, id: UniqueEntityId): SlideshowSession {
    return new SlideshowSession(props, id);
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
  get status(): SlideshowStatus {
    return this.props.status;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get source(): SlideshowSource {
    return this.props.source;
  }
  get albumId(): string | undefined {
    return this.props.albumId;
  }
  get photoIds(): readonly string[] {
    return this.props.photoIds;
  }
  get settings(): SlideshowSettings {
    return this.props.settings;
  }
  get viewCount(): number {
    return this.props.viewCount;
  }
  get lastViewedAt(): Date | undefined {
    return this.props.lastViewedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get lastSentTo(): string | undefined {
    return this.props.lastSentTo;
  }
  get lastSentAt(): Date | undefined {
    return this.props.lastSentAt;
  }
  get sealedSecret(): string | undefined {
    return this.props.sealedSecret;
  }

  /** Keep an encrypted copy of the token so the studio can show the link again. */
  sealToken(sealedSecret: string): void {
    this.props.sealedSecret = sealedSecret;
  }

  isExpired(now: Date = new Date()): boolean {
    return now > this.props.expiresAt;
  }

  /** Whole days left, rounded up so "23 hours left" reads as 1 day rather than 0. */
  daysLeft(now: Date = new Date()): number {
    return Math.max(0, Math.ceil((this.props.expiresAt.getTime() - now.getTime()) / DAY_MS));
  }

  assertViewable(now: Date = new Date()): void {
    if (this.props.status === "REVOKED") throw new SlideshowUnavailableError("revoked");
    if (this.isExpired(now)) throw new SlideshowUnavailableError("expired");
  }

  recordView(now: Date = new Date()): void {
    this.props.viewCount += 1;
    this.props.lastViewedAt = now;
  }

  /** Notes that the link was emailed to the client. Nothing else about the link changes. */
  recordSent(to: string, at: Date = new Date()): void {
    this.props.lastSentTo = to;
    this.props.lastSentAt = at;
  }

  /** "Refresh photos": the studio re-took the list from the same source. */
  replacePhotos(photoIds: string[]): void {
    this.props.photoIds = [...photoIds];
  }

  updateSettings(changes: Partial<SlideshowSettings>): void {
    this.props.settings = checkedSettings({ ...this.props.settings, ...changes });
  }

  /**
   * Push the expiry out, so the link family already has keeps working. Counted from today
   * if it has already lapsed, so extending an expired link never leaves it still expired.
   */
  extend(days: number = DEFAULT_SLIDESHOW_TTL_DAYS, now: Date = new Date()): void {
    if (this.props.status === "REVOKED") throw new SlideshowUnavailableError("revoked");
    const from = Math.max(now.getTime(), this.props.expiresAt.getTime());
    this.props.expiresAt = new Date(from + days * DAY_MS);
  }

  revoke(): void {
    this.props.status = "REVOKED";
  }
}
