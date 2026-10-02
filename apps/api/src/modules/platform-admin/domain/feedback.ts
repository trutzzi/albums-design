import { AggregateRoot, UniqueEntityId } from "@albumflow/domain-kernel";

export type FeedbackKind = "IDEA" | "PROBLEM" | "QUESTION" | "PRAISE";
export type FeedbackStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

export interface FeedbackProps {
  studioId: string;
  memberId: string | undefined;
  /** Copied at the time it was sent, so the inbox stays readable if the member leaves. */
  authorName: string;
  authorEmail: string;
  kind: FeedbackKind;
  message: string;
  /** 1 (unhappy) to 5 (delighted), when the photographer chose to give one. */
  rating: number | undefined;
  /** The app path they were on, e.g. /albums/…, so a problem report has its context. */
  page: string | undefined;
  userAgent: string | undefined;
  status: FeedbackStatus;
  /** Visible to admins only. */
  adminNote: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_FEEDBACK_LENGTH = 4000;

/** Something a photographer told us from inside the app. */
export class Feedback extends AggregateRoot<FeedbackProps> {
  private constructor(props: FeedbackProps, id: UniqueEntityId) {
    super(props, id);
  }

  static submit(params: Omit<FeedbackProps, "status" | "adminNote" | "createdAt" | "updatedAt">): Feedback {
    const message = params.message.trim();
    if (!message) throw new Error("Write a few words first.");
    if (message.length > MAX_FEEDBACK_LENGTH) throw new Error(`Keep it under ${MAX_FEEDBACK_LENGTH} characters.`);
    if (params.rating !== undefined && (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5)) {
      throw new Error("A rating is a whole number from 1 to 5.");
    }
    const now = new Date();
    return new Feedback(
      { ...params, message, status: "NEW", adminNote: "", createdAt: now, updatedAt: now },
      UniqueEntityId.create(),
    );
  }

  static reconstitute(props: FeedbackProps, id: UniqueEntityId): Feedback {
    return new Feedback(props, id);
  }

  get snapshot(): Readonly<FeedbackProps> {
    return this.props;
  }

  get status(): FeedbackStatus {
    return this.props.status;
  }

  triage(params: { status?: FeedbackStatus | undefined; adminNote?: string | undefined }): void {
    if (params.status) this.props.status = params.status;
    if (params.adminNote !== undefined) this.props.adminNote = params.adminNote.slice(0, MAX_FEEDBACK_LENGTH);
    this.props.updatedAt = new Date();
  }
}

export interface FeedbackRepository {
  save(feedback: Feedback): Promise<void>;
  findById(id: string): Promise<Feedback | undefined>;
  /** Newest first. */
  list(filter: {
    status?: FeedbackStatus | undefined;
    kind?: FeedbackKind | undefined;
    limit: number;
  }): Promise<Feedback[]>;
  /** Unresolved items, and the average rating over the given window. */
  summary(since: Date): Promise<{ open: number; newCount: number; averageRating: number | null; ratings: number }>;
  deleteByStudioId(studioId: string): Promise<void>;
}
