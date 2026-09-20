import type { EmailSender } from "../../../../shared-kernel/email";

export type InvitationKind = "pick" | "review" | "download";
/** The photographer's own app language — they know which one their client reads. */
export type InvitationLanguage = "en" | "ro";

export interface Invitation {
  kind: InvitationKind;
  /** The address the link was sent to. */
  to: string;
  clientName: string;
  projectName: string;
  /** The full client-facing URL, e.g. https://app.example.com/pick/<token>. */
  url: string;
  /** Sent alongside the link, the way a photographer pastes both into one message today. */
  password: string | undefined;
  language: InvitationLanguage;
  /** Absolute URL of the logo shown at the top — mail clients cannot load anything relative. */
  logoUrl?: string | undefined;
  /** The photographer's studio, so the client sees who it is from before they see the tool. */
  studioName?: string | undefined;
  /** Download links only: the day the photos stop being available. */
  availableUntil?: Date | undefined;
  /** Where a reply should go — the photographer, never the no-reply mailbox. */
  replyTo?: string | undefined;
}

function formatDate(date: Date, language: InvitationLanguage): string {
  return date.toLocaleDateString(language === "ro" ? "ro-RO" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface Copy {
  subject: string;
  /** The words on the one big button. */
  action: string;
  greeting: string;
  lead: string;
  /** One line per instruction, rendered as a short list. */
  steps: string[];
  linkLabel: string;
  passwordLabel: string;
  passwordNote: string;
  closing: string;
}

function copyFor(invitation: Invitation): Copy {
  const { clientName, projectName, language } = invitation;
  const until = invitation.availableUntil ? formatDate(invitation.availableUntil, language) : "";

  if (language === "ro") {
    const greeting = `Salut, ${clientName}!`;
    const closing = "Dacă linkul nu funcționează sau ai întrebări, răspunde la acest email.";
    const passwordNote = "Majusculele și cratima nu contează când scrii parola.";
    if (invitation.kind === "pick") {
      return {
        subject: `Alege-ți fotografiile — ${projectName}`,
        action: "Deschide galeria",
        greeting,
        lead: `Fotografiile de la „${projectName}" te așteaptă. Alegerea se face în doi pași, pe telefon sau pe calculator.`,
        steps: [
          "Pasul 1: parcurge toate fotografiile și marchează cu inimă tot ce îți place. Aici nu există limită.",
          "Pasul 2: vezi doar ce ai marcat și alegi fotografiile finale.",
          "Poți reveni oricând înainte să trimiți selecția.",
        ],
        linkLabel: "Linkul tău",
        passwordLabel: "Parola",
        passwordNote,
        closing,
      };
    }
    if (invitation.kind === "review") {
      return {
        subject: `Albumul tău este gata de vizualizat — ${projectName}`,
        action: "Vezi albumul",
        greeting,
        lead: `Am pregătit albumul pentru „${projectName}". Îl poți parcurge pagină cu pagină și îmi poți spune ce ai schimba.`,
        steps: [
          "Deschide linkul și răsfoiește paginile duble.",
          "Lasă un comentariu pe orice pagină la care ai observații.",
          "Când ești mulțumit, apasă „Aprobă albumul”.",
        ],
        linkLabel: "Linkul tău",
        passwordLabel: "Parola",
        passwordNote,
        closing,
      };
    }
    return {
      subject: `Fotografiile tale sunt gata de descărcat — ${projectName}`,
      action: "Descarcă fotografiile",
      greeting,
      lead: `Fotografiile de la „${projectName}" sunt gata, la dimensiune completă.`,
      steps: [
        "Deschide linkul, răsfoiește galeria și descarcă tot într-un singur fișier.",
        until ? `Linkul funcționează până pe ${until}, apoi fotografiile sunt șterse definitiv.` : "",
        "Salvează fișierul într-un loc sigur — e bine să ai și o a doua copie.",
      ].filter(Boolean),
      linkLabel: "Linkul tău",
      passwordLabel: "Parola",
      passwordNote,
      closing,
    };
  }

  const greeting = `Hi ${clientName}!`;
  const closing = "If the link doesn't work or you have any questions, just reply to this email.";
  const passwordNote = "Capitals and the dash don't matter when you type the password.";
  if (invitation.kind === "pick") {
    return {
      subject: `Choose your photos — ${projectName}`,
      action: "Open your gallery",
      greeting,
      lead: `Your photos from "${projectName}" are ready for you to go through. Choosing happens in two steps, on your phone or a computer.`,
      steps: [
        "Step 1: look through every photo and tap the heart on anything you like. There's no limit here.",
        "Step 2: you'll see only the ones you marked, and choose your final photos from those.",
        "You can go back and forth until you send your selection.",
      ],
      linkLabel: "Your link",
      passwordLabel: "Password",
      passwordNote,
      closing,
    };
  }
  if (invitation.kind === "review") {
    return {
      subject: `Your album is ready to look at — ${projectName}`,
      action: "View your album",
      greeting,
      lead: `I've put together the album for "${projectName}". You can go through it page by page and tell me what you'd change.`,
      steps: [
        "Open the link and browse the spreads.",
        "Leave a note on any page you'd like changed.",
        'When you\'re happy with it, press "Approve album".',
      ],
      linkLabel: "Your link",
      passwordLabel: "Password",
      passwordNote,
      closing,
    };
  }
  return {
    subject: `Your photos are ready to download — ${projectName}`,
    action: "Download your photos",
    greeting,
    lead: `Your photos from "${projectName}" are ready, at full size.`,
    steps: [
      "Open the link, browse the gallery, and download everything in one file.",
      until ? `The link works until ${until}, after which the photos are permanently deleted.` : "",
      "Save the file somewhere safe — a second copy is always worth having.",
    ].filter(Boolean),
    linkLabel: "Your link",
    passwordLabel: "Password",
    passwordNote,
    closing,
  };
}

const INK = "#14181c";
const SOFT = "#4b5560";
const FAINT = "#7c8791";
const LINE = "#e2e6e4";
const ACCENT = "#ad5522";
const PAPER = "#f4f5f3";

/**
 * A plain, table-based layout with inline styles — the only thing mail clients render
 * reliably. Everything degrades sensibly: the whole message reads fine with images
 * blocked, and the link is repeated as text under the button for clients that strip it.
 */
function renderHtml(invitation: Invitation, copy: Copy): string {
  const { logoUrl, studioName } = invitation;
  const header = [
    logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" width="132" alt="${escapeHtml(studioName ?? "AlbumFlow")}" style="display:block;margin:0 auto 14px;max-width:132px;height:auto;border:0">`
      : "",
    studioName
      ? `<div style="font:600 15px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${SOFT};text-align:center">${escapeHtml(studioName)}</div>`
      : "",
  ].join("");

  const stepFont = "15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const steps = copy.steps
    .map(
      (step) =>
        `<tr>` +
        `<td valign="top" style="width:18px;padding:0 0 10px 0;font:${stepFont};color:${ACCENT}">&bull;</td>` +
        `<td valign="top" style="padding:0 0 10px 0;font:${stepFont};color:${SOFT}">${escapeHtml(step)}</td>` +
        `</tr>`,
    )
    .join("");

  const password = invitation.password
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 22px">
         <tr><td style="background:${PAPER};border:1px solid ${LINE};border-radius:10px;padding:16px;text-align:center">
           <div style="font:600 12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${FAINT};text-transform:uppercase;letter-spacing:.08em">${escapeHtml(copy.passwordLabel)}</div>
           <div style="font:700 24px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:${INK};letter-spacing:.14em;padding:6px 0 4px">${escapeHtml(invitation.password!)}</div>
           <div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${FAINT}">${escapeHtml(copy.passwordNote)}</div>
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${PAPER}">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${PAPER};padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden">
      <tr><td style="padding:28px 28px 8px">${header}</td></tr>
      <tr><td style="padding:10px 28px 0">
        <h1 style="margin:0 0 6px;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">${escapeHtml(copy.greeting)}</h1>
        <p style="margin:0 0 18px;font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${SOFT}">${escapeHtml(copy.lead)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${steps}</table>
      </td></tr>
      <tr><td style="padding:22px 28px 6px" align="center">
        <a href="${escapeHtml(invitation.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font:600 16px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:15px 30px;border-radius:10px">${escapeHtml(copy.action)}</a>
        <div style="padding-top:12px;font:13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${FAINT};word-break:break-all">${escapeHtml(invitation.url)}</div>
      </td></tr>
      <tr><td style="padding:0 28px">${password}</td></tr>
      <tr><td style="padding:0 28px 26px">
        <p style="margin:0;font:14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${FAINT}">${escapeHtml(copy.closing)}</p>
      </td></tr>
    </table>
    <div style="padding:14px 0 0;font:12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${FAINT}">AlbumFlow</div>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The email a photographer sends their client with a selection, review or download link.
 *
 * It carries the link and its password together, which is what a photographer pastes into one
 * message by hand today: the password stops a forwarded link from opening the gallery, it is
 * not meant to defend the client's own inbox. Sending is always something the photographer
 * asks for — nothing here fires on its own.
 */
export class ClientInvitationMailer {
  constructor(private readonly email: EmailSender) {}

  async send(invitation: Invitation): Promise<void> {
    const copy = copyFor(invitation);
    const lines = [
      copy.greeting,
      "",
      copy.lead,
      "",
      ...copy.steps.map((step) => `- ${step}`),
      "",
      `${copy.linkLabel}: ${invitation.url}`,
      ...(invitation.password
        ? [`${copy.passwordLabel}: ${invitation.password}`, copy.passwordNote]
        : []),
      "",
      copy.closing,
    ];

    const html = renderHtml(invitation, copy);

    await this.email.send({
      to: [invitation.to],
      subject: copy.subject,
      text: lines.join("\n"),
      html,
      ...(invitation.replyTo ? { replyTo: invitation.replyTo } : {}),
    });
  }
}
