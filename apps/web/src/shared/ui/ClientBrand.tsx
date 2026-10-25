import { useEffect, type CSSProperties } from "react";
import type { ClientBrandingDTO, ClientStyle } from "@albumflow/contracts";
import { fixedTheme, titleFontStack, titleFontStylesheet, watermarkVariables } from "@/shared/lib/client-style";

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

/**
 * Applies a Studio Pro studio's gallery style to a client page: loads its title font,
 * fixes the page theme it chose (the client's theme switch is then hidden), and returns
 * the CSS variables for the page root. Without branding nothing changes.
 */
export function useClientStyle(branding: ClientBrandingDTO | null | undefined): {
  style: CSSProperties | undefined;
  themeFixed: boolean;
} {
  const font = branding?.style.titleFont;
  const theme = fixedTheme(branding?.style);
  useTitleFont(font);

  // On the root, so the whole page (body included) takes the studio's colours while it is open.
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.dataset.clientTheme = theme;
    return () => {
      delete root.dataset.clientTheme;
    };
  }, [theme]);

  const base = brandStyle(branding);
  return {
    style: font ? ({ ...base, "--title-font": titleFontStack(font) } as CSSProperties) : base,
    themeFixed: theme !== null,
  };
}

/** Loads a title font's stylesheet once per page, so text set in it shows in it. */
export function useTitleFont(font: ClientStyle["titleFont"] | undefined): void {
  useEffect(() => {
    const href = font ? titleFontStylesheet(font) : null;
    if (!href || document.head.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [font]);
}

/** How an album proof is marked: a class for the overlay, and the variables it reads. */
export interface ProofMark {
  className: string;
  style?: CSSProperties;
}

/**
 * The mark over album proofs: the plan's "PROOF" watermark on the plans that have one,
 * otherwise the studio's own logo or name when it turned that on (Studio Pro), else none.
 */
export function proofMark(
  branding: ClientBrandingDTO | null | undefined,
  planWatermark: boolean,
): ProofMark | undefined {
  if (planWatermark) return { className: "proof-watermark" };
  const mark = branding?.style.watermark;
  if (!branding || !mark?.enabled) return undefined;
  return {
    className: `studio-watermark studio-watermark--${mark.position}`,
    style: watermarkVariables(branding) as CSSProperties,
  };
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
