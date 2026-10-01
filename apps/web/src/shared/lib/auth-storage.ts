/**
 * Where a logged-in session lives between page loads. `localStorage`, not a
 * cookie — this API is called cross-origin from a statically hosted frontend
 * (see `VITE_API_URL`), so a cookie would need SameSite/domain plumbing this
 * deploy shape doesn't have. The token is a JWT the server can already
 * verify on its own, so nothing here needs to be tamper-proof client-side.
 */

const TOKEN_KEY = "albumflow.token";
const STUDIO_ID_KEY = "albumflow.studioId";
const NAME_KEY = "albumflow.name";

export interface StoredSession {
  token: string;
  studioId: string;
  name: string;
}

export function loadSession(): StoredSession | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const studioId = localStorage.getItem(STUDIO_ID_KEY);
    const name = localStorage.getItem(NAME_KEY);
    // "undefined" (the string): a session saved by a client build older than
    // this field, back when there was nothing real to store here — treat it
    // as absent rather than showing it to the user verbatim.
    if (!token || !studioId || !name || name === "undefined") return null;
    return { token, studioId, name };
  } catch {
    // Private browsing, blocked storage, etc. — behave as logged out.
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(STUDIO_ID_KEY, session.studioId);
    localStorage.setItem(NAME_KEY, session.name);
  } catch {
    // Nothing to fall back to; the session just won't survive a reload.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STUDIO_ID_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch {
    // Already effectively cleared if storage isn't reachable.
  }
}
