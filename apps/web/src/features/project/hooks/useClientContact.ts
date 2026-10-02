import { useState } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";

/**
 * Who a shoot's client links go to. One client per shoot: the shoot's saved contact
 * prefills every link form, and what the photographer types is shared by all of them.
 */
export function useClientContact(shoot: { clientName?: string | null; clientEmail?: string | null } | undefined) {
  const { language } = useLanguage();
  const [typedEmail, setEmail] = useState("");
  const [emailLanguage, setEmailLanguage] = useState<"en" | "ro">(language);
  return {
    name: shoot?.clientName ?? "",
    // The shoot is the source of truth; the field starts from it and the photographer can edit.
    email: typedEmail || (shoot?.clientEmail ?? ""),
    setEmail,
    emailLanguage,
    setEmailLanguage,
  };
}

export type ClientContact = ReturnType<typeof useClientContact>;
