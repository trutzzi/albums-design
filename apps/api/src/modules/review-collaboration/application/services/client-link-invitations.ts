import type { ClientContactDirectory } from "../ports/client-contact";
import { consoleLogger, type Logger } from "../../../../shared-kernel/logger";
import type { StudioBrandingDirectory } from "../../../../shared-kernel/studio-branding";
import { emailBrandFor } from "./email-brand";
import type { StudioContacts } from "../ports/delivery-gateway";
import type { ClientInvitationMailer, InvitationKind, InvitationLanguage } from "./client-invitation.mailer";

export interface InviteCommand {
  kind: InvitationKind;
  projectId: string;
  projectName: string;
  /** The client-facing token, so the full URL can be built here rather than in three places. */
  token: string;
  password: string | undefined;
  clientName: string;
  to: string;
  language: InvitationLanguage;
  availableUntil?: Date | undefined;
}

export interface InviteOutcome {
  sentTo?: string;
  /** Why it could not be sent, in words the photographer can act on. The link itself is fine. */
  error?: string;
}

const PATHS: Record<InvitationKind, string> = { pick: "pick", review: "review", download: "download" };

/**
 * Emails a client link on the photographer's behalf. Best effort by design: the link has
 * already been created and works, so a mail server that refuses must never fail the request —
 * the photographer is told and can copy the link instead.
 */
export class ClientLinkInvitations {
  constructor(
    private readonly mailer: ClientInvitationMailer,
    private readonly contacts: ClientContactDirectory,
    /** The studio's own address, used as reply-to so a client's reply reaches the photographer. */
    private readonly studios: StudioContacts,
    /** Where the client-facing app lives (WEB_ORIGIN), for building the link. */
    private readonly webOrigin: string,
    private readonly logger: Logger = consoleLogger,
    /** The studio's own look, when its plan includes white-label pages. */
    private readonly branding?: StudioBrandingDirectory,
  ) {}

  /** The app also serves the logo the email shows. */
  private logoUrl(): string {
    return `${this.webOrigin.replace(/\/$/, "")}/logo-full.png`;
  }

  urlFor(kind: InvitationKind, token: string): string {
    return `${this.webOrigin.replace(/\/$/, "")}/${PATHS[kind]}/${token}`;
  }

  /** Also remembers the name and address on the shoot, so the next link prefills. */
  async invite(command: InviteCommand): Promise<InviteOutcome> {
    try {
      await this.contacts.remember(command.projectId, { name: command.clientName, email: command.to });
      const [studio, branding] = await Promise.all([
        this.studios.forProject(command.projectId),
        this.branding?.forProject(command.projectId) ?? null,
      ]);
      await this.mailer.send({
        kind: command.kind,
        to: command.to,
        clientName: command.clientName,
        projectName: command.projectName,
        // The page opens in the language the photographer wrote the email in.
        url: `${this.urlFor(command.kind, command.token)}?lang=${command.language}`,
        logoUrl: this.logoUrl(),
        password: command.password,
        language: command.language,
        ...(command.availableUntil ? { availableUntil: command.availableUntil } : {}),
        // The client reads the photographer's name at the top, not the tool's.
        ...(studio?.studioName ? { studioName: studio.studioName } : {}),
        ...(studio?.ownerEmails[0] ? { replyTo: studio.ownerEmails[0] } : {}),
        brand: emailBrandFor(studio?.studioName, branding ?? null),
      });
      return { sentTo: command.to };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      this.logger.error("could not send a client link invitation", { kind: command.kind, projectId: command.projectId, err: error });
      return { error: reason };
    }
  }
}
