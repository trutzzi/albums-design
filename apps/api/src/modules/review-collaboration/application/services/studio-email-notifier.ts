import type { EmailSender } from "../../../../shared-kernel/email";
import type { DownloadNotifier, StudioContacts } from "../ports/delivery-gateway";
import type { PickNotifier } from "../ports/pick-gateway";

/**
 * Tells the studio's owners by email when a client does something that needs
 * their attention. Every message is written in English and Romanian together —
 * the studio's language is not stored, and the app itself ships in both.
 * Best effort: the client's action is already recorded, so a mail failure is
 * logged and never surfaces to the client.
 */
export class StudioEmailNotifier implements PickNotifier, DownloadNotifier {
  constructor(
    private readonly email: EmailSender,
    private readonly contacts: StudioContacts,
    /** Where the studio app lives, for the link in the email (WEB_ORIGIN). */
    private readonly webOrigin: string,
    private readonly log: (message: string) => void = console.error,
  ) {}

  async picksSubmitted(params: Parameters<PickNotifier["picksSubmitted"]>[0]): Promise<void> {
    await this.notify(params.projectId, (project, link) => ({
      subject: `${params.clientName} a trimis selecția foto / sent their photo selection — ${project}`,
      lines: [
        `RO: ${params.clientName} și-a ales fotografiile pentru „${project}": ${roPhotos(params.photoIds.length)}. Poți crea albumul direct din selecție.`,
        `EN: ${params.clientName} has chosen their photos for "${project}": ${enPhotos(params.photoIds.length)}. You can build the album straight from the selection.`,
      ],
      link,
    }));
  }

  async photosDownloaded(params: Parameters<DownloadNotifier["photosDownloaded"]>[0]): Promise<void> {
    const size = formatBytes(params.byteSize);
    const again = params.downloadNumber > 1;
    await this.notify(params.projectId, (project, link) => ({
      subject: `${params.clientName} a descărcat fotografiile / downloaded the photos — ${project}`,
      lines: [
        `RO: ${params.clientName} a descărcat ${again ? `din nou (a ${params.downloadNumber}-a oară) ` : ""}toate fotografiile pentru „${project}": ${roPhotos(params.photoCount)}, ${size}.`,
        `EN: ${params.clientName} has ${again ? `downloaded again (download #${params.downloadNumber}) ` : "downloaded "}all the photos for "${project}": ${enPhotos(params.photoCount)}, ${size}.`,
      ],
      link,
    }));
  }

  private async notify(
    projectId: string,
    compose: (projectName: string, link: string) => { subject: string; lines: string[]; link: string },
  ): Promise<void> {
    try {
      const studio = await this.contacts.forProject(projectId);
      if (!studio) return;
      if (studio.ownerEmails.length === 0) {
        this.log(`[email] no owner email on file for project ${projectId}; nothing sent`);
        return;
      }
      const link = `${this.webOrigin.replace(/\/$/, "")}/projects/${projectId}`;
      const message = compose(studio.projectName, link);
      const text = [...message.lines, "", `${message.link}`].join("\n");
      const html =
        message.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("") +
        `<p><a href="${escapeHtml(message.link)}">${escapeHtml(message.link)}</a></p>`;
      await this.email.send({ to: studio.ownerEmails, subject: message.subject, text, html });
    } catch (error) {
      this.log(`[email] could not notify the studio about project ${projectId}: ${String(error)}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Romanian counts 2–19 plainly and from 20 up (and at 100, 101…) needs "de": "3 fotografii", "25 de fotografii". */
export function roPhotos(count: number): string {
  if (count === 1) return "1 fotografie";
  const lastTwo = count % 100;
  return lastTwo === 0 || lastTwo >= 20 ? `${count} de fotografii` : `${count} fotografii`;
}

export function enPhotos(count: number): string {
  return count === 1 ? "1 photo" : `${count} photos`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
