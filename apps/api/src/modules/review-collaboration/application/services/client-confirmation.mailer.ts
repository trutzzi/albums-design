import type { EmailSender } from "../../../../shared-kernel/email";
import { consoleLogger, type Logger } from "../../../../shared-kernel/logger";
import type { ReviewNotifier } from "../ports/album-gateway";
import type { ClientContact, ClientContactDirectory } from "../ports/client-contact";
import type { StudioContacts } from "../ports/delivery-gateway";
import type { PickNotifier } from "../ports/pick-gateway";
import type { StudioBrandingDirectory } from "../../../../shared-kernel/studio-branding";
import { enPhotos, roPhotos } from "./studio-email-notifier";
import { brandedNoteHtml, emailBrandFor } from "./email-brand";

/**
 * Tells the client their action reached the photographer: favourites sent, album approved.
 * Signed with the studio's name and answered by the studio (reply-to), never by AlbumFlow.
 * Written in Romanian and English together, as the client's language is not stored. Best
 * effort: the client's action is already recorded, so a mail failure is logged and no more.
 */
export class ClientConfirmationMailer implements PickNotifier, ReviewNotifier {
  constructor(
    private readonly email: EmailSender,
    private readonly clients: ClientContactDirectory,
    private readonly studios: StudioContacts,
    private readonly logger: Logger = consoleLogger,
    /** The studio's own look, when its plan includes white-label pages. */
    private readonly branding?: StudioBrandingDirectory,
  ) {}

  async picksSubmitted(params: Parameters<PickNotifier["picksSubmitted"]>[0]): Promise<void> {
    const count = params.photoIds.length;
    await this.send(
      () => this.clients.forProject(params.projectId),
      (contact, studio) => ({
        subject: `Selecția ta a fost trimisă / Your selection was sent — ${contact.projectName}`,
        lines: [
          `RO: Mulțumim, ${params.clientName}! ${studio} a primit selecția ta: ${roPhotos(count)}. Te va contacta când albumul este gata.`,
          `EN: Thank you, ${params.clientName}! ${studio} has received your selection: ${enPhotos(count)}. They will be in touch when the album is ready.`,
        ],
      }),
    );
  }

  async clientDecided(params: Parameters<ReviewNotifier["clientDecided"]>[0]): Promise<void> {
    const approved = params.decision === "APPROVED";
    await this.send(
      () => this.clients.forAlbum(params.albumId),
      (contact, studio) =>
        approved
          ? {
              subject: `Album aprobat / Album approved — ${contact.projectName}`,
              lines: [
                `RO: Mulțumim, ${params.clientName}! Ai aprobat albumul. ${studio} îl pregătește acum pentru tipar.`,
                `EN: Thank you, ${params.clientName}! You approved the album. ${studio} is now preparing it for print.`,
              ],
            }
          : {
              subject: `Modificările tale au fost trimise / Your changes were sent — ${contact.projectName}`,
              lines: [
                `RO: Mulțumim, ${params.clientName}! ${studio} a primit cererea ta de modificări și îți va trimite albumul actualizat.`,
                `EN: Thank you, ${params.clientName}! ${studio} has received your requested changes and will send you the updated album.`,
              ],
            },
    );
  }

  private async send(
    find: () => Promise<ClientContact | undefined>,
    compose: (contact: ClientContact, studioName: string) => { subject: string; lines: string[] },
  ): Promise<void> {
    let projectId: string | undefined;
    try {
      const contact = await find();
      projectId = contact?.projectId;
      // No address on the shoot: nothing to confirm to, and nothing wrong either.
      if (!contact?.email) return;
      const [studio, branding] = await Promise.all([
        this.studios.forProject(contact.projectId),
        this.branding?.forProject(contact.projectId) ?? null,
      ]);
      const brand = emailBrandFor(studio?.studioName, branding ?? null);
      const message = compose(contact, brand.displayName ?? "The studio");
      await this.email.send({
        to: [contact.email],
        ...(studio?.ownerEmails[0] ? { replyTo: studio.ownerEmails[0] } : {}),
        senderName: brand.senderName,
        ...(brand.logo ? { inlineImages: [brand.logo.image] } : {}),
        subject: message.subject,
        text: message.lines.join("\n\n"),
        html: brandedNoteHtml(brand, message.lines),
      });
    } catch (error) {
      this.logger.error("could not send a client confirmation", { projectId, err: error });
    }
  }
}
