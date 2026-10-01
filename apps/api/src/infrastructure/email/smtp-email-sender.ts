import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailSender } from "../../shared-kernel/email";

export interface SmtpConfig {
  host: string;
  port: number;
  /** `true` for implicit TLS (port 465); `false` upgrades with STARTTLS when the server offers it (port 587). */
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

/**
 * Turns whatever MAIL_FROM says into a name and a bare address.
 *
 * A configured sender arrives in every shape: `Studio <a@b.ro>`, a bare `a@b.ro`, quoted,
 * or — when a shell, a secret store or a compose file has eaten the angle brackets along
 * the way — `Studio a@b.ro`. That last one is not a valid address, and a strict receiver
 * (Yahoo, for one) answers `501 Syntax error` and the mail bounces. Pulling the address
 * out ourselves and handing nodemailer the two parts separately makes the header and the
 * SMTP envelope correct no matter which shape it was written in.
 */
export function parseSender(value: string): { name?: string; address: string } {
  // Secrets often arrive wrapped in the quotes .env files use ("AlbumFlow <app@x.ro>"),
  // sometimes only half of them. The address is whatever looks like one; everything
  // before it, minus brackets and quotes, is the display name.
  const trimmed = value.trim();
  const match = /[^\s<>"',;]+@[^\s<>"',;]+/.exec(trimmed);
  if (!match) return { address: trimmed };
  const address = match[0];
  const name = trimmed
    .slice(0, match.index)
    .replace(/[<>"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name ? { name, address } : { address };
}

export class SmtpEmailSender implements EmailSender {
  readonly id = "smtp";
  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.password ?? "" } } : {}),
      // A mail server that never answers must not hang the request that triggered the mail.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    const sender = parseSender(this.config.from);
    await this.transport.sendMail({
      from: message.senderName ? { name: message.senderName, address: sender.address } : sender,
      // Stated explicitly so the SMTP envelope carries the bare address, whatever the
      // display name contains.
      envelope: { from: sender.address, to: message.to },
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.inlineImages?.length
        ? {
            attachments: message.inlineImages.map((image) => ({
              cid: image.cid,
              contentType: image.contentType,
              content: image.content,
              filename: `${image.cid}.${image.contentType.split("/")[1] ?? "png"}`,
            })),
          }
        : {}),
    });
  }
}
