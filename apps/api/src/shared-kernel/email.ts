export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound mail, kept behind a port like storage is: today plain SMTP (works
 * with a domain mailbox, Brevo, Gmail app passwords, SES SMTP…), and an API-based
 * provider later would be one more class with nothing that sends mail changing.
 */
export interface EmailSender {
  readonly id: string;
  send(message: EmailMessage): Promise<void>;
}
