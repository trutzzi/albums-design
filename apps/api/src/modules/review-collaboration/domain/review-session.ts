import { createHash, randomBytes } from "node:crypto";
import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type ReviewStatus = "OPEN" | "CHANGES_REQUESTED" | "APPROVED" | "REVOKED";

export interface ReviewComment {
  id: string;
  spreadIndex: number;
  slotId: string | undefined;
  body: string;
  authorName: string;
  resolved: boolean;
  createdAt: Date;
}

export interface ReviewSessionProps {
  albumId: UniqueEntityId;
  /** Only the hash is stored — the raw token exists once, in the share link. */
  tokenHash: string;
  clientName: string;
  status: ReviewStatus;
  comments: ReviewComment[];
  expiresAt: Date;
  approvedAt: Date | undefined;
  createdAt: Date;
}

export class ReviewClosedError extends Error {
  constructor(status: ReviewStatus) {
    super(`This review link is ${status.toLowerCase()} and no longer accepts changes.`);
    this.name = "ReviewClosedError";
  }
}

export class ReviewExpiredError extends Error {
  constructor() {
    super("This review link has expired. Ask your photographer for a fresh one.");
    this.name = "ReviewExpiredError";
  }
}

const DEFAULT_TTL_DAYS = 60;

export class ReviewSession extends AggregateRoot<ReviewSessionProps> {
  private constructor(props: ReviewSessionProps, id: UniqueEntityId) {
    super(props, id);
  }

  /** Returns the raw token alongside the aggregate; it is never recoverable afterwards. */
  static open(
    params: { albumId: UniqueEntityId; clientName: string; ttlDays?: number },
    id?: UniqueEntityId,
  ): { session: ReviewSession; token: string } {
    const token = randomBytes(24).toString("base64url");
    const ttlDays = params.ttlDays ?? DEFAULT_TTL_DAYS;
    const session = new ReviewSession(
      {
        albumId: params.albumId,
        tokenHash: hashToken(token),
        clientName: params.clientName,
        status: "OPEN",
        comments: [],
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        approvedAt: undefined,
        createdAt: new Date(),
      },
      id ?? UniqueEntityId.create(),
    );
    return { session, token };
  }

  static reconstitute(props: ReviewSessionProps, id: UniqueEntityId): ReviewSession {
    return new ReviewSession(props, id);
  }

  get albumId(): UniqueEntityId {
    return this.props.albumId;
  }

  get clientName(): string {
    return this.props.clientName;
  }

  get status(): ReviewStatus {
    return this.props.status;
  }

  get comments(): readonly ReviewComment[] {
    return this.props.comments;
  }

  get openComments(): ReviewComment[] {
    return this.props.comments.filter((comment) => !comment.resolved);
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get approvedAt(): Date | undefined {
    return this.props.approvedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  matchesToken(token: string): boolean {
    return this.props.tokenHash === hashToken(token);
  }

  isExpired(now: Date = new Date()): boolean {
    return now > this.props.expiresAt;
  }

  addComment(params: {
    spreadIndex: number;
    slotId?: string | undefined;
    body: string;
    authorName: string;
  }): ReviewComment {
    this.assertActionable();
    const comment: ReviewComment = {
      id: UniqueEntityId.create().toString(),
      spreadIndex: params.spreadIndex,
      slotId: params.slotId,
      body: params.body,
      authorName: params.authorName,
      resolved: false,
      createdAt: new Date(),
    };
    this.props.comments.push(comment);
    return comment;
  }

  resolveComment(commentId: string): void {
    const comment = this.props.comments.find((candidate) => candidate.id === commentId);
    if (!comment) throw new Error(`Comment ${commentId} does not exist in this review.`);
    comment.resolved = true;
  }

  requestChanges(): void {
    this.assertActionable();
    this.props.status = "CHANGES_REQUESTED";
  }

  approve(): void {
    this.assertActionable();
    this.props.status = "APPROVED";
    this.props.approvedAt = new Date();
  }

  revoke(): void {
    this.props.status = "REVOKED";
  }

  private assertActionable(): void {
    if (this.props.status === "APPROVED" || this.props.status === "REVOKED") {
      throw new ReviewClosedError(this.props.status);
    }
    if (this.isExpired()) throw new ReviewExpiredError();
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
