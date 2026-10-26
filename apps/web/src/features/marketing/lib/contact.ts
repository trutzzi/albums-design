export type ContactErrorKey = "contact.error.tooMany" | "contact.error.notSent" | "contact.error.generic";

/**
 * The API answers in English; the page says the same thing in the reader's language. Read
 * by shape rather than `instanceof ApiError`, so this stays free of the browser-only client.
 */
export function contactErrorKey(error: unknown): ContactErrorKey {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "TOO_MANY_ATTEMPTS") return "contact.error.tooMany";
  if (code === "MESSAGE_NOT_SENT") return "contact.error.notSent";
  return "contact.error.generic";
}
