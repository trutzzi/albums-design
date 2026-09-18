/**
 * Where a logged-in session lives between page loads. `localStorage`, not a
 * cookie — this API is called cross-origin from a statically hosted frontend
 * (see `VITE_API_URL`), so a cookie would need SameSite/domain plumbing this
 * deploy shape doesn't have. The token is a JWT the server can already
 * verify on its own, so nothing here needs to be tamper-proof client-side.
 */

const TOKEN_KEY = "albumflow.token";
const STUDIO_ID_KEY = "albumflow.studioId";

export interface StoredSession {
  token: string;
  studioId: string;
}

export function loadSession(): StoredSession | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const studioId = localStorage.getItem(STUDIO_ID_KEY);
    if (!token || !studioId) return null;
    return { token, studioId };
  } catch {
    // Private browsing, blocked storage, etc. — behave as logged out.
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(STUDIO_ID_KEY, session.studioId);
  } catch {
    // Nothing to fall back to; the session just won't survive a reload.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STUDIO_ID_KEY);
  } catch {
    // Already effectively cleared if storage isn't reachable.
  }
}
