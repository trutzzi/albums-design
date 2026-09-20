import { randomBytes } from "node:crypto";
import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";
import { hashToken } from "./review-session";

/**
 * OPEN: the client is choosing. SUBMITTED: they sent their choice and it is
 * frozen until the photographer reopens it. REVOKED: the link no longer works.
 */
export type PickStatus = "OPEN" | "SUBMITTED" | "REVOKED";

export interface PickSessionProps {
  projectId: UniqueEntityId;
  /** Only the hash is stored — the raw token exists once, in the share link. */
  tokenHash: string;
  clientName: string;
  status: PickStatus;
  pickedPhotoIds: string[];
  /** How many photos the client may choose (e.g. what the album has room for). No limit when undefined. */
  pickLimit: number | undefined;
  expiresAt: Date;
  submittedAt: Date | undefined;
  createdAt: Date;
  /** Hash of the client password. Absent on links created before passwords existed, which stay open. */
  passwordHash?: string | undefined;
  /** Encrypted link token + password, so the studio can view them again. */
  sealedSecret?: string | undefined;
}

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
        pickedPhotoIds: [],
        pickLimit: params.pickLimit,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        submittedAt: undefined,
        createdAt: new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
    return { session, token };
  }

  static reconstitute(props: PickSessionProps, id: UniqueEntityId): PickSession {
    return new PickSession(props, id);
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

  /** Idempotent: picking an already-picked photo, or dropping one that is not picked, changes nothing. */
  setPick(photoId: string, picked: boolean): void {
    this.assertOpen();
    const already = this.props.pickedPhotoIds.includes(photoId);
    if (picked && !already) {
      if (this.props.pickLimit !== undefined && this.props.pickedPhotoIds.length >= this.props.pickLimit) {
        throw new PickLimitError(this.props.pickLimit);
      }
      this.props.pickedPhotoIds.push(photoId);
    } else if (!picked && already) {
      this.props.pickedPhotoIds = this.props.pickedPhotoIds.filter((id) => id !== photoId);
    }
  }

  submit(): void {
    this.assertOpen();
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
}
