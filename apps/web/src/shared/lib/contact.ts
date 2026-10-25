/** How a client reaches a studio: phone, WhatsApp, a saved contact, the website. */

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
