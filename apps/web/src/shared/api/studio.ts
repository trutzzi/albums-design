import type { StudioBrandingInput } from "@albumflow/contracts";
import { request } from "./http";

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
