export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  /** Where a reply should go when it is not the From address — the photographer, for a client invitation. */
  replyTo?: string;
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
