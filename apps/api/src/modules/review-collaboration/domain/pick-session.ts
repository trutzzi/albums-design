import { randomBytes } from "node:crypto";
import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { hashToken } from "./review-session";

/**
 * OPEN: the client is choosing. SUBMITTED: they sent their choice and it is
 * frozen until the photographer reopens it. REVOKED: the link no longer works.
 */
export type PickStatus = "OPEN" | "SUBMITTED" | "REVOKED";

/**
 * Choosing 60 photos out of 2,000 in one pass is the part clients get stuck on, so it
 * happens in two:
 *
 * SHORTLIST — go through the whole shoot and mark anything you might want. No limit;
 *             this is meant to be generous.
 * FINAL     — only the shortlist is shown, and the photographer's limit applies here.
 *
 * The client can step back to the shortlist at any time before sending.
 */
export type PickStage = "SHORTLIST" | "FINAL";

export interface PickSessionProps {
  projectId: UniqueEntityId;
  /** Only the hash is stored — the raw token exists once, in the share link. */
  tokenHash: string;
  clientName: string;
  status: PickStatus;
  /** Step 1: everything the client might want. Never limited. */
  shortlistedPhotoIds: string[];
  /** Step 2: what they actually chose. Always a subset of the shortlist, and bounded by `pickLimit`. */
  pickedPhotoIds: string[];
  stage: PickStage;
  /** When the client first reached step 2 — also what stops the shortlist being carried over twice. */
  firstReachedFinalAt: Date | undefined;
  /** How many photos the client may finally choose (e.g. what the album has room for). No limit when undefined. */
  pickLimit: number | undefined;
  expiresAt: Date;
  submittedAt: Date | undefined;
  createdAt: Date;
  /** Hash of the client password. Absent on links created before passwords existed, which stay open. */
  passwordHash?: string | undefined;
  /** Encrypted link token + password, so the studio can view them again. */
  sealedSecret?: string | undefined;
}

/** A row written before two-step picking existed carries neither field. */
export type StoredPickSessionProps = Omit<
  PickSessionProps,
  "shortlistedPhotoIds" | "stage" | "firstReachedFinalAt"
> & {
  shortlistedPhotoIds?: string[] | undefined;
  stage?: PickStage | undefined;
  firstReachedFinalAt?: Date | undefined;
};

export class PickClosedError extends Error {
  constructor(status: PickStatus) {
    super(
      status === "SUBMITTED"
        ? "Your selection was already sent to your photographer."
        : "This selection link is no longer active.",
    );
    this.name = "PickClosedError";
  }
}

export class PickExpiredError extends Error {
  constructor() {
    super("This selection link has expired. Ask your photographer for a fresh one.");
    this.name = "PickExpiredError";
  }
}

export class PickLimitError extends Error {
  constructor(limit: number) {
    super(`You can choose up to ${limit} photos. Remove one to pick another.`);
    this.name = "PickLimitError";
  }
}

/** The action does not belong to the step the client is on — or to no step at all. */
export class PickStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PickStageError";
  }
}

const DEFAULT_TTL_DAYS = 60;

export class PickSession extends AggregateRoot<PickSessionProps> {
  private constructor(props: PickSessionProps, id: UniqueEntityId) {
    super(props, id);
  }

  /** Returns the raw token alongside the aggregate; it is never recoverable afterwards. */
  static open(
    params: { projectId: UniqueEntityId; clientName: string; pickLimit?: number; ttlDays?: number },
    id?: UniqueEntityId,
  ): { session: PickSession; token: string } {
    const token = randomBytes(24).toString("base64url");
    const ttlDays = params.ttlDays ?? DEFAULT_TTL_DAYS;
    const session = new PickSession(
      {
        projectId: params.projectId,
        tokenHash: hashToken(token),
        clientName: params.clientName,
        status: "OPEN",
        shortlistedPhotoIds: [],
        pickedPhotoIds: [],
        stage: "SHORTLIST",
        firstReachedFinalAt: undefined,
        pickLimit: params.pickLimit,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        submittedAt: undefined,
        createdAt: new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
    return { session, token };
  }

  static reconstitute(props: StoredPickSessionProps, id: UniqueEntityId): PickSession {
    const stage = props.stage ?? (props.shortlistedPhotoIds ? "SHORTLIST" : "FINAL");
    return new PickSession(
      {
        ...props,
        // A legacy link is already past step 1, so it counts as having been there — otherwise
        // stepping back and forward would offer to carry its picks over again.
        firstReachedFinalAt: props.firstReachedFinalAt ?? (stage === "FINAL" ? props.createdAt : undefined),
        // A link made before two-step picking has no shortlist of its own: what it picked
        // IS its shortlist, and it is already past the first step — so it keeps behaving
        // exactly as it did, one list and one limit.
        shortlistedPhotoIds: props.shortlistedPhotoIds ?? [...props.pickedPhotoIds],
        stage,
      },
      id,
    );
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

  get status(): PickStatus {
    return this.props.status;
  }

  get stage(): PickStage {
    return this.props.stage;
  }

  get firstReachedFinalAt(): Date | undefined {
    return this.props.firstReachedFinalAt;
  }

  get shortlistedPhotoIds(): readonly string[] {
    return this.props.shortlistedPhotoIds;
  }

  get pickedPhotoIds(): readonly string[] {
    return this.props.pickedPhotoIds;
  }

  get pickLimit(): number | undefined {
    return this.props.pickLimit;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get submittedAt(): Date | undefined {
    return this.props.submittedAt;
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

  matchesToken(token: string): boolean {
    return this.props.tokenHash === hashToken(token);
  }

  isExpired(now: Date = new Date()): boolean {
    return now > this.props.expiresAt;
  }

  /**
   * Step 1. Idempotent, and never limited — the whole point is to mark everything that
   * might make it. Dropping a photo from the shortlist also drops it from the final
   * picks, so the final selection can never contain something that is no longer wanted.
   */
  setShortlisted(photoId: string, shortlisted: boolean): void {
    this.assertOpen();
    this.assertStage("SHORTLIST");
    const already = this.props.shortlistedPhotoIds.includes(photoId);
    if (shortlisted && !already) {
      this.props.shortlistedPhotoIds.push(photoId);
    } else if (!shortlisted && already) {
      this.props.shortlistedPhotoIds = this.props.shortlistedPhotoIds.filter((id) => id !== photoId);
      this.props.pickedPhotoIds = this.props.pickedPhotoIds.filter((id) => id !== photoId);
    }
  }

  /** Step 2. Idempotent, only over shortlisted photos, and where the photographer's limit applies. */
  setPick(photoId: string, picked: boolean): void {
    this.assertOpen();
    this.assertStage("FINAL");
    const already = this.props.pickedPhotoIds.includes(photoId);
    if (picked && !already) {
      if (!this.props.shortlistedPhotoIds.includes(photoId)) {
        throw new PickStageError("That photo is not in your shortlist — go back a step to add it.");
      }
      if (this.props.pickLimit !== undefined && this.props.pickedPhotoIds.length >= this.props.pickLimit) {
        throw new PickLimitError(this.props.pickLimit);
      }
      this.props.pickedPhotoIds.push(photoId);
    } else if (!picked && already) {
      this.props.pickedPhotoIds = this.props.pickedPhotoIds.filter((id) => id !== photoId);
    }
  }

  /**
   * Move to step 2. The first time, if the shortlist already fits inside the limit there is
   * nothing to narrow down, so it is carried over whole — the client can still unpick, but is
   * never asked to re-tap 40 photos they have just marked.
   */
  goToFinal(): void {
    this.assertOpen();
    if (this.props.shortlistedPhotoIds.length === 0) {
      throw new PickStageError("Mark at least one photo you might want before moving on.");
    }
    const fitsWhole =
      this.props.pickLimit === undefined || this.props.shortlistedPhotoIds.length <= this.props.pickLimit;
    // Only on the way in for the first time: coming back later with nothing chosen means the
    // client cleared their choices on purpose, and re-filling them would undo that.
    if (this.props.firstReachedFinalAt === undefined && fitsWhole) {
      this.props.pickedPhotoIds = [...this.props.shortlistedPhotoIds];
    }
    this.props.firstReachedFinalAt ??= new Date();
    this.props.stage = "FINAL";
  }

  /** Back to step 1 to add or drop possibilities. Whatever was already chosen is kept. */
  backToShortlist(): void {
    this.assertOpen();
    this.props.stage = "SHORTLIST";
  }

  /**
   * Drops photos that no longer exist from both lists, whatever step the client is on —
   * a photo the photographer deleted must not be sent back as a choice, and must not be
   * counted towards the limit.
   */
  forgetMissing(present: ReadonlySet<string>): void {
    this.props.shortlistedPhotoIds = this.props.shortlistedPhotoIds.filter((id) => present.has(id));
    this.props.pickedPhotoIds = this.props.pickedPhotoIds.filter((id) => present.has(id));
  }

  submit(): void {
    this.assertOpen();
    if (this.props.stage !== "FINAL") {
      throw new PickStageError("Move on to the final selection before sending it.");
    }
    if (this.props.pickedPhotoIds.length === 0) {
      throw new Error("Pick at least one photo before sending your selection.");
    }
    this.props.status = "SUBMITTED";
    this.props.submittedAt = new Date();
  }

  /** The photographer lets the client amend a sent selection. */
  reopen(): void {
    if (this.props.status === "REVOKED") throw new PickClosedError("REVOKED");
    this.props.status = "OPEN";
    this.props.submittedAt = undefined;
  }

  revoke(): void {
    this.props.status = "REVOKED";
  }

  private assertOpen(): void {
    if (this.props.status !== "OPEN") throw new PickClosedError(this.props.status);
    if (this.isExpired()) throw new PickExpiredError();
  }

  private assertStage(stage: PickStage): void {
    if (this.props.stage !== stage) {
      throw new PickStageError(
        stage === "SHORTLIST"
          ? "You are on the final selection — go back a step to change your shortlist."
          : "You are still on the shortlist — move on to the final selection first.",
      );
    }
  }
}
