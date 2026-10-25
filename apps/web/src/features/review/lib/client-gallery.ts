import type { DownloadScope } from "@/shared/api";

/** What the gallery shows right now — the same shape as what a download can hold, so "this section" is just the filter. */
export type GalleryFilter = DownloadScope;

export function filterGallery<Photo extends { id: string; section: string | null }>(
  photos: readonly Photo[],
  filter: GalleryFilter,
  favorites: ReadonlySet<string>,
): Photo[] {
  if (filter.kind === "favorites") return photos.filter((photo) => favorites.has(photo.id));
  if (filter.kind === "section") return photos.filter((photo) => photo.section === filter.section);
  return [...photos];
}

/** A stable string for a filter, to reset the gallery's batching when it changes. */
export function filterKey(filter: GalleryFilter): string {
  return filter.kind === "section" ? `section:${filter.section}` : filter.kind;
}

/** The first chapters as tabs, the rest behind "More" — keeping the active one visible as a tab. */
export function splitTabs(sections: readonly string[], visible: number, active?: string): [string[], string[]] {
  const shown = sections.slice(0, visible);
  const hidden = sections.slice(visible);
  if (active && hidden.includes(active) && shown.length > 0) {
    const dropped = shown.pop()!;
    return [
      [...shown, active],
      [dropped, ...hidden.filter((section) => section !== active)],
    ];
  }
  return [shown, hidden];
}

/** A WhatsApp chat link; wa.me wants the international number as digits only. */
export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** vCard text values escape backslashes, commas, semicolons and line breaks (RFC 6350 §3.4). */
function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, "\\n");
}

/** A contact card the phone's address book opens, so "Save contact" needs no server. */
export function buildVCard(contact: {
  name: string;
  title?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCard(contact.name)}`, `ORG:${escapeVCard(contact.name)}`];
  if (contact.title) lines.push(`TITLE:${escapeVCard(contact.title)}`);
  if (contact.phone) lines.push(`TEL;TYPE=CELL:${contact.phone.replace(/[^\d+]/g, "")}`);
  if (contact.email) lines.push(`EMAIL:${escapeVCard(contact.email)}`);
  if (contact.website) lines.push(`URL:${escapeVCard(contact.website)}`);
  lines.push("END:VCARD");
  // vCard lines end in CRLF.
  return `${lines.join("\r\n")}\r\n`;
}

/** The website as people say it: no scheme, no trailing slash. */
export function displayWebsite(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
