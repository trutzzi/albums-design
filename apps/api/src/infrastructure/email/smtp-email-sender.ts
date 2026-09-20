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
    await this.transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  }
}
