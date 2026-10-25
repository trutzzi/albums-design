import type { ClientBrandingDTO, ClientStyle } from "@albumflow/contracts";

type TitleFont = ClientStyle["titleFont"];

/** Each curated title font: the CSS stack, and the Google Fonts family to load (none for the app's own). */
const TITLE_FONTS: Record<TitleFont, { stack: string; google: string | null }> = {
  "plex-serif": { stack: '"IBM Plex Serif", ui-serif, Georgia, serif', google: null },
  cormorant: { stack: '"Cormorant Garamond", ui-serif, Georgia, serif', google: "Cormorant+Garamond:wght@400;500" },
  playfair: { stack: '"Playfair Display", ui-serif, Georgia, serif', google: "Playfair+Display:wght@400;500" },
  lora: { stack: "Lora, ui-serif, Georgia, serif", google: "Lora:wght@400;500" },
  montserrat: { stack: "Montserrat, ui-sans-serif, system-ui, sans-serif", google: "Montserrat:wght@300;500" },
  josefin: { stack: '"Josefin Sans", ui-sans-serif, system-ui, sans-serif', google: "Josefin+Sans:wght@300;400" },
};

/** The names shown in the studio's font picker, in the font itself. */
export const TITLE_FONT_LABELS: Record<TitleFont, string> = {
  "plex-serif": "IBM Plex Serif",
  cormorant: "Cormorant Garamond",
  playfair: "Playfair Display",
  lora: "Lora",
  montserrat: "Montserrat",
  josefin: "Josefin Sans",
};

export function titleFontStack(font: TitleFont): string {
  return TITLE_FONTS[font].stack;
}

/** The stylesheet that loads a title font, or null when the app already has it. */
export function titleFontStylesheet(font: TitleFont): string | null {
  const family = TITLE_FONTS[font].google;
  return family ? `https://fonts.googleapis.com/css2?family=${family}&display=swap` : null;
}

/** The theme the studio fixed for its client pages, or null when they follow the client's own choice. */
export function fixedTheme(style: ClientStyle | undefined): Exclude<ClientStyle["theme"], "auto"> | null {
  return style && style.theme !== "auto" ? style.theme : null;
}

/** The studio's name for a photo category, falling back to the app's translation. */
export function sectionLabel(
  section: string,
  style: ClientStyle | undefined,
  translate: (key: string) => string,
): string {
  return style?.sectionNames[section]?.trim() || translate(`gallery.section.${section}`);
}

/** CSS variables for the studio watermark over proofs: its logo when it has one, its name otherwise. */
export function watermarkVariables(branding: ClientBrandingDTO): Record<string, string> {
  const { opacity } = branding.style.watermark;
  return branding.logo
    ? { "--wm-image": `url("${branding.logo}")`, "--wm-text": '""', "--wm-opacity": String(opacity) }
    : { "--wm-image": "none", "--wm-text": JSON.stringify(branding.name), "--wm-opacity": String(opacity) };
}
