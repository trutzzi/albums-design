import type { ClientBrandingDTO } from "@albumflow/contracts";
import type { InlineImage } from "#src/shared-kernel/email";
import { escapeHtml } from "#src/shared-kernel/html";

/** The house colour, for studios whose plan does not include their own branding. */
export const ALBUMFLOW_ACCENT = "#ad5522";
const LOGO_CID = "studio-logo";
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

/** How an email to a client looks and who it says it is from, given what the studio's plan includes. */
export interface EmailBrand {
  /** The From line's display name. */
  senderName: string;
  /** The name shown at the top of the email. */
  displayName: string | undefined;
  accent: string;
  /** The studio's logo, attached inline; null shows the AlbumFlow logo (or none). */
  logo: { src: string; image: InlineImage } | null;
  /** Lower plans carry a small "Sent with AlbumFlow"; white-label plans never mention it. */
  poweredBy: boolean;
}

/**
 * White-label plans (branding present) send as the studio, in its colour and with its
 * logo. Every other plan still names the studio first — "Golden Hour via AlbumFlow" — so
 * the client recognises who wrote, and carries a quiet AlbumFlow footer.
 */
export function emailBrandFor(studioName: string | undefined, branding: ClientBrandingDTO | null): EmailBrand {
  if (!branding) {
    return {
      senderName: studioName ? `${studioName} via AlbumFlow` : "AlbumFlow",
      displayName: studioName,
      accent: ALBUMFLOW_ACCENT,
      logo: null,
      poweredBy: true,
    };
  }
  const match = branding.logo ? DATA_URL.exec(branding.logo) : null;
  return {
    senderName: branding.name,
    displayName: branding.name,
    accent: branding.accent ?? ALBUMFLOW_ACCENT,
    logo: match
      ? {
          src: `cid:${LOGO_CID}`,
          image: { cid: LOGO_CID, contentType: match[1]!, content: Buffer.from(match[2]!, "base64") },
        }
      : null,
    poweredBy: false,
  };
}

const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

/** A short note to a client in the studio's look: logo or name on top, a band of its colour, the text. */
export function brandedNoteHtml(brand: EmailBrand, paragraphs: string[]): string {
  const header = brand.logo
    ? `<img src="${brand.logo.src}" width="120" alt="${escapeHtml(brand.displayName ?? "")}" style="display:block;margin:0 auto;max-width:120px;height:auto;border:0">`
    : brand.displayName
      ? `<div style="font:600 16px/1.4 ${FONT};color:#14181c;text-align:center">${escapeHtml(brand.displayName)}</div>`
      : "";
  const body = paragraphs
    .map((text) => `<p style="margin:0 0 14px;font:15px/1.6 ${FONT};color:#4b5560">${escapeHtml(text)}</p>`)
    .join("");
  const footer = brand.poweredBy
    ? `<div style="padding:14px 0 0;font:12px/1.5 ${FONT};color:#7c8791">Sent with AlbumFlow</div>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f3">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f5f3;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2e6e4;border-top:4px solid ${brand.accent};border-radius:14px;overflow:hidden">
      <tr><td style="padding:24px 28px 6px">${header}</td></tr>
      <tr><td style="padding:12px 28px 14px">${body}</td></tr>
    </table>
    ${footer}
  </td></tr>
</table>
</body></html>`;
}
