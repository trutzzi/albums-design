import { loadSession } from "@/shared/lib/auth-storage";
import { grantKindForPath, loadGrant } from "@/shared/lib/client-grants";

// `||`, not `??`: a GitHub Actions secret that was never created (or left
// blank) still gets wired into the build as an empty string, not as
// genuinely absent — `??` only excuses null/undefined, so an empty string
// would silently defeat every one of these fallbacks and produce URLs like
// `/studios//projects`, an empty studio segment, rather than the demo default.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
