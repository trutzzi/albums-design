export type GrantKind = "review" | "download" | "pick";

const key = (kind: GrantKind, token: string) => `albumflow.grant.${kind}.${token}`;

/**
 * The proof that a client entered a link's password, kept for this browser tab
 * only (sessionStorage) so closing the tab asks again. Storage can throw
 * (private mode, blocked site data), so every access is guarded — without it the
 * client simply has to re-enter the password on reload.
 */
export function loadGrant(kind: GrantKind, token: string): string | undefined {
  try {
    return window.sessionStorage.getItem(key(kind, token)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveGrant(kind: GrantKind, token: string, grant: string): void {
  try {
    window.sessionStorage.setItem(key(kind, token), grant);
  } catch {
    // Not persisted: the grant is still returned to the caller for this page view.
  }
}

/** Which grant a request path needs, if it is a client link route. */
export function grantKindForPath(path: string): { kind: GrantKind; token: string } | undefined {
  const match = /^\/(review|download|pick)\/([^/?#]+)/.exec(path);
  if (!match || match[2] === undefined) return undefined;
  return { kind: match[1] as GrantKind, token: match[2] };
}
