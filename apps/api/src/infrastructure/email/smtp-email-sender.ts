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
  const trimmed = value.trim();
  const bracketed = /<([^<>]+)>\s*$/.exec(trimmed);
  const address = (bracketed ? bracketed[1]! : trimmed.split(/\s+/).pop() ?? trimmed).trim();
  const name = (bracketed ? trimmed.slice(0, bracketed.index) : trimmed.slice(0, trimmed.length - address.length))
    .trim()
    .replace(/^["']|["']$/g, "")
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
      from: sender,
      // Stated explicitly so the SMTP envelope carries the bare address, whatever the
      // display name contains.
      envelope: { from: sender.address, to: message.to },
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
  }
}
