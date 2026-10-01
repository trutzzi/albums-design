import type {
  AlbumCoverDTO,
  AlbumStyleDTO,
  ClientBrandingDTO,
  StudioBrandingInput,
  Crop,
  PhotoFocus,
  PhotoTreatment,
  SlotFrame,
  TextBlockDTO,
  AlbumDTO,
  AlbumFormatDTO,
  AuthSession,
  CreateProjectInput,
  ProjectDTO,
  ProjectSummaryDTO,
  AlbumEditInput,
  ConfirmUploadInput,
  LayoutSuggestionDTO,
  LayoutTemplateDTO,
  LoginInput,
  PhotoAnalysisDTO,
  PhotoDTO,
  RegisterInput,
  RequestUploadInput,
  RequestUploadResponse,
} from "@albumflow/contracts";
import { loadSession } from "./auth-storage";
import { grantKindForPath, loadGrant, saveGrant } from "./client-grants";

// `||`, not `??`: a GitHub Actions secret that was never created (or left
// blank) still gets wired into the build as an empty string, not as
// genuinely absent — `??` only excuses null/undefined, so an empty string
// would silently defeat every one of these fallbacks and produce URLs like
// `/studios//projects`, an empty studio segment, rather than the demo default.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const DEMO_STUDIO_ID =
  import.meta.env.VITE_STUDIO_ID || "11111111-1111-4111-8111-111111111111";
export const DEMO_PROJECT_ID =
  import.meta.env.VITE_PROJECT_ID || "22222222-2222-4222-8222-222222222222";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const session = loadSession();
  if (session?.token) headers.set("Authorization", `Bearer ${session.token}`);
  // Client links protected by a password: send the proof of it entered earlier in this tab.
  const clientLink = grantKindForPath(path);
  const grant = clientLink && loadGrant(clientLink.kind, clientLink.token);
  if (grant) headers.set("X-Access-Grant", grant);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; code?: string }
      | null;
    throw new ApiError(
      body?.message ?? `Request failed with ${response.status}`,
      response.status,
      body?.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- Auth --------------------------------------------------------------

/** The account is created locked: it opens from the link emailed to the address. */
export function registerAccount(input: RegisterInput): Promise<{ status: "CONFIRMATION_SENT"; email: string }> {
  return request("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function verifyEmail(token: string): Promise<AuthSession> {
  return request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
}

/** Always resolves, whether or not the address has an account waiting. */
export function resendConfirmation(email: string, language: "en" | "ro"): Promise<void> {
  return request("/auth/resend-confirmation", { method: "POST", body: JSON.stringify({ email, language }) });
}

export function login(input: LoginInput): Promise<AuthSession> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

/** Always resolves, whether or not the address has an account — the API never says which. */
export function requestPasswordReset(email: string, language: "en" | "ro"): Promise<void> {
  return request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email, language }) });
}

export function resetPassword(token: string, password: string): Promise<AuthSession> {
  return request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}

// --- Projects --------------------------------------------------------------

export function listProjects(studioId: string): Promise<ProjectSummaryDTO[]> {
  return request(`/studios/${studioId}/projects`);
}

export function createProject(studioId: string, input: CreateProjectInput): Promise<ProjectDTO> {
  return request(`/studios/${studioId}/projects`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteProject(projectId: string): Promise<void> {
  return request(`/projects/${projectId}`, { method: "DELETE" });
}

export function getProject(projectId: string): Promise<ProjectDTO> {
  return request(`/projects/${projectId}`);
}

// --- Media ingestion -------------------------------------------------------

export function requestUpload(
  studioId: string,
  projectId: string,
  input: RequestUploadInput,
): Promise<RequestUploadResponse> {
  return request(`/studios/${studioId}/projects/${projectId}/photos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function putFileToStorage(uploadUrl: string, file: File, signal?: AbortSignal): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Upload to storage failed with ${response.status}`);
}

/**
 * Throws away a photo whose upload never finished — the rows a cancelled batch leaves
 * behind. The server refuses for anything already confirmed.
 */
export function abandonUpload(photoId: string): Promise<void> {
  return request(`/photos/${photoId}`, { method: "DELETE" });
}

export function confirmUpload(photoId: string, input: ConfirmUploadInput = {}): Promise<PhotoDTO> {
  return request(`/photos/${photoId}/confirm-upload`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listProjectPhotos(projectId: string): Promise<PhotoDTO[]> {
  return request(`/projects/${projectId}/photos`);
}

// --- Photo intelligence ----------------------------------------------------

export function listProjectAnalyses(projectId: string): Promise<PhotoAnalysisDTO[]> {
  return request(`/projects/${projectId}/analyses`);
}

// --- Album composition -----------------------------------------------------


export function listLayoutTemplates(): Promise<LayoutTemplateDTO[]> {
  return request("/layout-templates");
}

export function suggestSpreadLayouts(
  projectId: string,
  photoIds: string[],
): Promise<LayoutSuggestionDTO[]> {
  return request(`/projects/${projectId}/spread-suggestions`, {
    method: "POST",
    body: JSON.stringify({ photoIds }),
  });
}

export function generateAlbum(
  projectId: string,
  input: { title?: string; targetSpreads?: number; format?: AlbumFormatDTO; photoIds?: string[] } = {},
): Promise<AlbumDTO> {
  return request(`/projects/${projectId}/albums`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listProjectAlbums(projectId: string): Promise<AlbumDTO[]> {
  return request(`/projects/${projectId}/albums`);
}

export function getAlbum(albumId: string): Promise<AlbumDTO> {
  return request(`/albums/${albumId}`);
}

export function editAlbum(albumId: string, command: AlbumEditInput): Promise<AlbumDTO> {
  return request(`/albums/${albumId}`, { method: "PATCH", body: JSON.stringify(command) });
}

export function deleteAlbum(albumId: string): Promise<void> {
  return request(`/albums/${albumId}`, { method: "DELETE" });
}

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
export async function unlockClientLink(kind: "review" | "download" | "pick", token: string, password: string): Promise<void> {
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

export function submitReviewDecision(
  token: string,
  decision: "APPROVED" | "CHANGES_REQUESTED",
): Promise<ReviewView> {
  return request(`/review/${token}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

// --- Export ----------------------------------------------------------------

export interface ExportJobDTO {
  id: string;
  albumId: string;
  printProfileId: string;
  status: "QUEUED" | "RENDERING" | "READY" | "FAILED";
  byteSize: number | null;
  pageCount: number | null;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface PrintProfileDTO {
  id: string;
  name: string;
  dpi: number;
  bleedMm: number;
  /** Safe area inset from the trim edge where nothing important should sit. */
  safeMarginMm: number;
  drawTrimMarks: boolean;
}

export function listPrintProfiles(): Promise<PrintProfileDTO[]> {
  return request("/print-profiles");
}

export function requestExport(albumId: string, printProfileId?: string): Promise<ExportJobDTO> {
  return request(`/albums/${albumId}/exports`, {
    method: "POST",
    body: JSON.stringify(printProfileId ? { printProfileId } : {}),
  });
}

export function listExports(albumId: string): Promise<ExportJobDTO[]> {
  return request(`/albums/${albumId}/exports`);
}

export function getExportDownload(exportJobId: string): Promise<{ url: string }> {
  return request(`/exports/${exportJobId}/download`);
}

export function deleteExport(exportJobId: string): Promise<void> {
  return request(`/exports/${exportJobId}`, { method: "DELETE" });
}

// --- Studio & billing ------------------------------------------------------

export interface StudioOverview {
  studio: {
    id: string;
    name: string;
    ownerEmail: string;
    createdAt: string;
    branding: { displayName: string; accent: string | null; logo: string | null } | null;
  };
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    albumsUsed: number;
    albumsIncluded: number | null;
    albumsRemaining: number | null;
    seatsUsed: number;
    seatsIncluded: number | null;
    periodStart: string;
    periodEnd: string;
    watermarkDrafts: boolean;
    watermarkExports: boolean;
    hasBillingAccount: boolean;
    /** The plan shows the studio's own branding on client pages (Studio Pro). */
    whiteLabel: boolean;
    /** What this studio pays per month for its plan. */
    priceEur: number;
    /** Joined during the launch offer: launch prices on every plan, for good. */
    launchPrice: boolean;
  };
  members: { id: string; name: string; email: string; role: string; accepted: boolean }[];
  /** "stripe": the studio can open the payment provider's portal for its card and invoices. */
  billing: { provider: "none" | "stripe" };
}

export interface PlanDto {
  code: "TRIAL" | "STARTER" | "STUDIO" | "STUDIO_PRO";
  name: string;
  /** What a studio signing up today pays per month: the launch price while the offer is open. */
  monthlyPriceEur: number;
  /** The list price. */
  regularPriceEur: number;
  /** What studios that joined during the launch offer pay, for as long as they stay. */
  launchPriceEur: number;
  /** Studios created before this keep the launch prices. */
  launchPricesUntil: string;
  /** `null` means unlimited. */
  albumsPerPeriod: number | null;
  seats: number | null;
  watermarkDrafts: boolean;
  watermarkExports: boolean;
  /** `null` means unlimited. */
  maxPhotosPerShoot: number | null;
  clientDownloadLinks: boolean;
}

export function listPlans(): Promise<PlanDto[]> {
  return request("/plans");
}

export function openBillingPortal(studioId: string): Promise<{ url: string }> {
  return request(`/studios/${studioId}/billing/portal`, { method: "POST" });
}

/** Studio Pro: the studio's own name, colour and logo on client pages. */
export function saveStudioBranding(studioId: string, branding: StudioBrandingInput): Promise<StudioOverview> {
  return request(`/studios/${studioId}/branding`, { method: "PUT", body: JSON.stringify(branding) });
}

export function getStudioOverview(studioId: string): Promise<StudioOverview> {
  return request(`/studios/${studioId}`);
}

export function inviteMember(
  studioId: string,
  input: { email: string; name: string; role: "OWNER" | "EDITOR" | "VIEWER" },
): Promise<{ memberId: string }> {
  return request(`/studios/${studioId}/members`, { method: "POST", body: JSON.stringify(input) });
}

export function removeMember(studioId: string, memberId: string): Promise<void> {
  return request(`/studios/${studioId}/members/${memberId}`, { method: "DELETE" });
}

// --- AI status ---------------------------------------------------------

export interface AiStatus {
  /** Whether the configured photo-analysis AI (e.g. the local Ollama server) is reachable right now. */
  available: boolean;
}

export function getAiStatus(): Promise<AiStatus> {
  return request("/ai/status");
}

// --- Client photo selection ("picks") ---------------------------------------

export interface PickSessionSummary {
  id: string;
  clientName: string;
  status: "OPEN" | "SUBMITTED" | "REVOKED";
  pickLimit: number | null;
  passwordProtected?: boolean;
  /** Which of the two picking steps the client is on. */
  stage: "SHORTLIST" | "FINAL";
  /** Step 1: how many they marked as possibilities. */
  shortlistedCount: number;
  /** Step 2: how many they finally chose. */
  pickedCount: number;
  pickedPhotoIds: string[];
  submittedAt: string | null;
  lastSentTo?: string | null;
  lastSentAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

export function openPickSession(
  projectId: string,
  input: { clientName: string; pickLimit?: number } & InvitationInput,
): Promise<{ sessionId: string; token: string; expiresAt: string; password?: string } & InvitationOutcome> {
  return request(`/projects/${projectId}/pick-sessions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listPickSessions(projectId: string): Promise<PickSessionSummary[]> {
  return request(`/projects/${projectId}/pick-sessions`);
}

/** The selection link and its password, readable again by the studio. */
export function sendPickInvitation(
  projectId: string,
  sessionId: string,
  input: { email?: string; language?: "en" | "ro" } = {},
): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPickAccess(projectId: string, sessionId: string): Promise<{ token: string; password: string }> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/access`);
}

export function reopenPickSession(projectId: string, sessionId: string): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/reopen`, { method: "POST" });
}

export function revokePickSession(projectId: string, sessionId: string): Promise<PickSessionSummary> {
  return request(`/projects/${projectId}/pick-sessions/${sessionId}/revoke`, { method: "POST" });
}

export type PickStage = "SHORTLIST" | "FINAL";

export interface PickState {
  id: string;
  clientName: string;
  status: "OPEN" | "SUBMITTED" | "REVOKED";
  /** Step 1 marks possibilities, step 2 narrows them to the photographer's limit. */
  stage: PickStage;
  pickLimit: number | null;
  shortlistedPhotoIds: string[];
  pickedPhotoIds: string[];
  expiresAt: string;
}

/** A photo in a client gallery: display copies only, plus its upright size (null until analysed). */
export interface ClientGalleryPhoto {
  id: string;
  fileName: string;
  previewUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
}

export interface PickView {
  session: PickState;
  projectName: string;
  photos: ClientGalleryPhoto[];
  /** Photos still being prepared; the gallery grows as they finish. */
  processingCount: number;
  branding: ClientBrandingDTO | null;
}

export function getPickView(token: string): Promise<PickView> {
  return request(`/pick/${token}`);
}

export function setPhotoPicked(token: string, photoId: string, picked: boolean): Promise<PickState> {
  return request(`/pick/${token}/photos/${photoId}`, {
    method: "PUT",
    body: JSON.stringify({ picked }),
  });
}

/** Move the client between step 1 (shortlist) and step 2 (final selection). */
export function setPickStage(token: string, stage: PickStage): Promise<PickState> {
  return request(`/pick/${token}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
}

export function submitPicks(token: string): Promise<PickState> {
  return request(`/pick/${token}/submit`, { method: "POST" });
}

// --- Client delivery (download links) ----------------------------------------

export interface DownloadSessionSummary {
  id: string;
  clientName: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  passwordProtected?: boolean;
  downloadCount: number;
  firstDownloadedAt: string | null;
  lastDownloadedAt: string | null;
  lastSentTo?: string | null;
  lastSentAt?: string | null;
  expiresAt: string;
  daysLeft: number;
  createdAt: string;
}

export function openDownloadSession(
  projectId: string,
  input: { clientName: string; ttlDays?: number } & InvitationInput,
): Promise<
  {
    sessionId: string;
    token: string;
    expiresAt: string;
    photoCount: number;
    missingCount: number;
    password?: string;
  } & InvitationOutcome
> {
  return request(`/projects/${projectId}/download-sessions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listDownloadSessions(projectId: string): Promise<DownloadSessionSummary[]> {
  return request(`/projects/${projectId}/download-sessions`);
}

/** The download link and its password, readable again by the studio. */
export function sendDownloadInvitation(
  projectId: string,
  sessionId: string,
  input: { email?: string; language?: "en" | "ro" } = {},
): Promise<DownloadSessionSummary> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/send`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDownloadAccess(projectId: string, sessionId: string): Promise<{ token: string; password: string }> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/access`);
}

export function revokeDownloadSession(projectId: string, sessionId: string): Promise<DownloadSessionSummary> {
  return request(`/projects/${projectId}/download-sessions/${sessionId}/revoke`, { method: "POST" });
}

export interface DownloadView {
  clientName: string;
  projectName: string;
  photoCount: number;
  missingCount: number;
  totalBytes: number;
  expiresAt: string;
  daysLeft: number;
  /** Display copies to browse before downloading. */
  photos: ClientGalleryPhoto[];
  /** Photos still being prepared for the gallery (they are in the download regardless). */
  processingCount: number;
  branding: ClientBrandingDTO | null;
}

export function getDownloadView(token: string): Promise<DownloadView> {
  return request(`/download/${token}`);
}

/** A plain link the browser follows, so the file streams straight to disk instead of through the page. */
export function downloadZipUrl(token: string): string {
  // A plain link cannot send a header, so a protected link's grant travels in the URL.
  const grant = loadGrant("download", token);
  return `${API_URL}/download/${token}/photos.zip${grant ? `?grant=${encodeURIComponent(grant)}` : ""}`;
}

// --- Feedback & admin ------------------------------------------------------

export type FeedbackKind = "IDEA" | "PROBLEM" | "QUESTION" | "PRAISE";
export type FeedbackStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

export function submitFeedback(input: {
  kind: FeedbackKind;
  message: string;
  rating?: number;
  page?: string;
}): Promise<{ id: string }> {
  return request("/feedback", { method: "POST", body: JSON.stringify(input) });
}

export function getAdminMe(): Promise<{ admin: boolean }> {
  return request("/admin/me");
}

export interface AdminFeedback {
  id: string;
  studioId: string;
  studioName: string | undefined;
  authorName: string;
  authorEmail: string;
  kind: FeedbackKind;
  message: string;
  rating: number | null;
  page: string | null;
  userAgent: string | null;
  status: FeedbackStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

export function listAdminFeedback(filter: { status?: FeedbackStatus; kind?: FeedbackKind }): Promise<AdminFeedback[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.kind) params.set("kind", filter.kind);
  const query = params.toString();
  return request(`/admin/feedback${query ? `?${query}` : ""}`);
}

export function triageFeedback(
  id: string,
  change: { status?: FeedbackStatus; adminNote?: string },
): Promise<AdminFeedback> {
  return request(`/admin/feedback/${id}`, { method: "PATCH", body: JSON.stringify(change) });
}

export type FunnelStep =
  | "signedUp"
  | "createdShoot"
  | "uploadedPhotos"
  | "builtAlbum"
  | "sentForReview"
  | "approved"
  | "exported";

export interface BusinessStats {
  generatedAt: string;
  studios: { total: number; new7d: number; new30d: number };
  activeStudios: { d7: number; d30: number };
  revenue: {
    mrrEur: number;
    payingStudios: number;
    trialToPaidPct: number;
    pastDue: number;
    cancelled: number;
    plans: { code: string; name: string; studios: number }[];
  };
  funnel: { step: FunnelStep; studios: number }[];
  totals: {
    photos: number;
    albums: number;
    reviewLinks: number;
    approvedAlbums: number;
    clientPicksSubmitted: number;
    exportsReady: number;
    exportsFailed: number;
  };
  daily: { day: string; signups: number; photos: number; albums: number }[];
  feedback: { open: number; newCount: number; averageRating: number | null; ratings: number };
}

export function getBusinessStats(): Promise<BusinessStats> {
  return request("/admin/stats/business");
}

export interface SystemStats {
  generatedAt: string;
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
    loadAverage: [number, number, number];
    cpus: number;
    /** `null` when the host does not report reclaimable memory (anything but Linux). */
    hostMemoryMb: { total: number; available: number | null };
  };
  dependencies: {
    database: { ok: boolean; latencyMs: number | null };
    queues: { name: string; waiting: number; active: number; delayed: number; failed: number; completed: number }[];
  };
  config: { mode: "production" | "demo"; storage: string; email: string; billing: string; vision: string; errorMonitoring: boolean };
  /** The long-term store's space; `null` when there is none (STORAGE_PROVIDER=none). */
  storageSpace:
    | { provider: string; usedBytes: number; totalBytes: number | null; checkedAt: string }
    | { provider: string; error: string; checkedAt: string }
    | null;
  http: {
    perMinute: { minute: string; requests: number; errors: number; p95Ms: number | null }[];
    lastHour: { requests: number; errors: number; errorRatePct: number; p50Ms: number | null; p95Ms: number | null };
    slowestRoutes: { route: string; requests: number; p95Ms: number }[];
    recentErrors: { at: string; method: string; route: string; message: string }[];
  };
}

export function getSystemStats(): Promise<SystemStats> {
  return request("/admin/stats/system");
}

export interface AdminStudio {
  studioId: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
  planCode: PlanDto["code"] | null;
  status: string | null;
  albumsUsed: number;
  /** `null` means unlimited. */
  albumsIncluded: number | null;
  periodEnd: string | null;
  /** Whether the owner opened their confirmation link. */
  emailConfirmed: boolean | null;
  shoots: number | null;
}

export interface AdminStudioPage {
  studios: AdminStudio[];
  total: number;
  page: number;
  pageSize: number;
}

export function listAdminStudios(query: { page: number; pageSize: number; search?: string }): Promise<AdminStudioPage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search?.trim()) params.set("search", query.search.trim());
  return request(`/admin/studios?${params.toString()}`);
}

/** Plans are changed only here, by a platform admin. */
export function setStudioPlan(studioId: string, planCode: PlanDto["code"]): Promise<AdminStudio> {
  return request(`/admin/studios/${studioId}/plan`, { method: "PUT", body: JSON.stringify({ planCode }) });
}

/** Removes the studio with all its shoots, photos and members. */
export function deleteAdminStudio(studioId: string): Promise<{ shootsDeleted: number }> {
  return request(`/admin/studios/${studioId}`, { method: "DELETE" });
}

export type ErrorIssueStatus = "OPEN" | "RESOLVED";
export type ErrorSource = "api" | "worker";

/** One kind of failure, with every time it happened counted. */
export interface AdminErrorIssue {
  id: string;
  source: ErrorSource;
  /** What the code was doing, e.g. "request failed" or "job failed". */
  title: string;
  errorType: string | null;
  errorMessage: string | null;
  /** "GET /review/:token", "storage › store-original", or the part of the app that logged it. */
  location: string | null;
  status: ErrorIssueStatus;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface AdminErrorOccurrence {
  id: string;
  occurredAt: string;
  requestId: string | null;
  errorMessage: string | null;
  stack: string | null;
  context: Record<string, string | number | boolean | null>;
}

export function listAdminErrors(filter: {
  status?: ErrorIssueStatus;
  source?: ErrorSource;
  search?: string;
}): Promise<AdminErrorIssue[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.source) params.set("source", filter.source);
  if (filter.search) params.set("search", filter.search);
  const query = params.toString();
  return request(`/admin/errors${query ? `?${query}` : ""}`);
}

export function getAdminError(id: string): Promise<{ issue: AdminErrorIssue; occurrences: AdminErrorOccurrence[] }> {
  return request(`/admin/errors/${id}`);
}

export function setAdminErrorStatus(id: string, status: ErrorIssueStatus): Promise<AdminErrorIssue> {
  return request(`/admin/errors/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
