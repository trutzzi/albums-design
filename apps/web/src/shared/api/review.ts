import type {
  AlbumCoverDTO,
  AlbumStyleDTO,
  ClientBrandingDTO,
  Crop,
  PhotoFocus,
  PhotoTreatment,
  SlotFrame,
  TextBlockDTO,
} from "@albumflow/contracts";
import { saveGrant } from "@/shared/lib/client-grants";
import { request } from "./http";

// --- Review ----------------------------------------------------------------

export interface ReviewSessionSummary {
  id: string;
  clientName: string;
  status: string;
  openComments: number;
  passwordProtected?: boolean;
  lastSentTo?: string | null;
  lastSentAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface ReviewView {
  session: {
    id: string;
    clientName: string;
    status: string;
    expiresAt: string;
    comments: {
      id: string;
      spreadIndex: number;
      slotId?: string;
      body: string;
      authorName: string;
      resolved: boolean;
      createdAt: string;
    }[];
  };
  album: {
    id: string;
    title: string;
    status: string;
    /** The studio's plan watermarks client proofs. */
    watermark: boolean;
    branding?: ClientBrandingDTO | null;
    format: { pageWidthMm: number; pageHeightMm: number; bleedMm: number };
    style: AlbumStyleDTO;
    cover: (AlbumCoverDTO & { previewUrl: string | null; focus?: PhotoFocus | null }) | null;
    spreads: {
      templateId: string;
      texts?: TextBlockDTO[];
      placements: {
        slotId: string;
        photoId: string;
        previewUrl: string | null;
        crop?: Crop;
        treatment?: PhotoTreatment;
        frame?: SlotFrame;
        focus?: PhotoFocus | null;
      }[];
    }[];
  };
}

/** Optional client email and whether to send the link there, shared by all three link kinds. */
export interface InvitationInput {
  clientEmail?: string;
  sendEmail?: boolean;
  language?: "en" | "ro";
}

export interface InvitationOutcome {
  /** Present when the link really was emailed. */
  emailSentTo?: string;
  /** Present when it could not be — the link itself is still fine. */
  emailError?: string;
}

export function openReviewSession(
  albumId: string,
  clientName: string,
  invitation: InvitationInput = {},
): Promise<{ sessionId: string; token: string; expiresAt: string; password?: string } & InvitationOutcome> {
  return request(`/albums/${albumId}/review-sessions`, {
    method: "POST",
    body: JSON.stringify({ clientName, ...invitation }),
  });
}

/** Emails an existing link — a resend, or one made before emailing existed. */
export function sendReviewInvitation(
  albumId: string,
  sessionId: string,
  input: { email?: string; language?: "en" | "ro" } = {},
): Promise<{ sentTo: string }> {
  return request(`/albums/${albumId}/review-sessions/${sessionId}/send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The album review link and its password, readable again by the studio. */
export function getReviewAccess(albumId: string, sessionId: string): Promise<{ token: string; password: string }> {
  return request(`/albums/${albumId}/review-sessions/${sessionId}/access`);
}

/** Exchanges the password a client typed for a grant, remembered for this tab. Throws ApiError on a wrong password. */
export async function unlockClientLink(
  kind: "review" | "download" | "pick",
  token: string,
  password: string,
): Promise<void> {
  const { grant } = await request<{ grant: string }>(`/${kind}/${token}/unlock`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  saveGrant(kind, token, grant);
}

export function listReviewSessions(albumId: string): Promise<ReviewSessionSummary[]> {
  return request(`/albums/${albumId}/review-sessions`);
}

export interface FeedbackComment {
  id: string;
  sessionId: string;
  clientName: string;
  spreadIndex: number;
  slotId?: string | undefined;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface AlbumFeedback {
  albumId: string;
  comments: FeedbackComment[];
  openCount: number;
  resolvedCount: number;
  sessions: ReviewSessionSummary[];
}

/** What the clients actually wrote, for the photographer who has to act on it. */
export function getAlbumFeedback(albumId: string): Promise<AlbumFeedback> {
  return request(`/albums/${albumId}/comments`);
}

export function resolveComment(albumId: string, commentId: string): Promise<AlbumFeedback> {
  return request(`/albums/${albumId}/comments/${commentId}/resolve`, { method: "POST" });
}

export function getReview(token: string): Promise<ReviewView> {
  return request(`/review/${token}`);
}

export function addReviewComment(
  token: string,
  input: { spreadIndex: number; slotId?: string; body: string },
): Promise<ReviewView> {
  return request(`/review/${token}/comments`, { method: "POST", body: JSON.stringify(input) });
}

export function submitReviewDecision(token: string, decision: "APPROVED" | "CHANGES_REQUESTED"): Promise<ReviewView> {
  return request(`/review/${token}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}
