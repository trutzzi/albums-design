import type { CSSProperties } from "react";
import type { ClientBrandingDTO } from "@albumflow/contracts";

/**
 * The studio's own colour on a client page: buttons, links and highlights follow it.
 * Nothing changes when the studio has no branding (or its plan does not include it).
 */
export function brandStyle(branding: ClientBrandingDTO | null | undefined): CSSProperties | undefined {
  if (!branding?.accent) return undefined;
  return {
    "--accent": branding.accent,
    "--accent-soft": `color-mix(in srgb, ${branding.accent} 16%, var(--surface))`,
  } as CSSProperties;
}

/** The studio's logo (or name) above a client page, in place of anything AlbumFlow. */
export function ClientBrandBar({ branding }: { branding: ClientBrandingDTO | null | undefined }) {
  if (!branding) return null;
  return (
    <div className="client-brand">
      {branding.logo ? (
        <img src={branding.logo} alt={branding.name} className="client-brand__logo" />
      ) : (
        <span className="client-brand__name">{branding.name}</span>
      )}
    </div>
  );
}
