import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ClientBrandingDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ContactDialog, hasContact } from "@/shared/ui/StudioContact";
import { firstGrapheme } from "@/shared/lib/text";

/**
 * The floating buttons in the corner of a client gallery: back to the top once the client
 * has scrolled, and "Contacts" — the studio's card with call, WhatsApp, email, the website,
 * and a vCard to save them to the phone's address book. On a phone they join `download` in
 * one bar along the bottom, where a thumb reaches.
 */
export function GalleryCornerButtons({
  branding,
  download,
}: {
  branding: ClientBrandingDTO | null;
  /** Shown here only on a phone; on a wide screen the download lives in the top bar. */
  download?: ReactNode;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="gallery-corner">
        {download && <div className="gallery-corner__download">{download}</div>}
        {scrolled && (
          <button
            type="button"
            className="gallery-corner__top"
            aria-label={t("gallery.backToTop")}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 20V5m0 0-6 6m6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
        {hasContact(branding) && (
          <button type="button" className="gallery-corner__contact" onClick={() => setOpen(true)}>
            <span className="gallery-corner__avatar" aria-hidden="true">
              {firstGrapheme(branding.name).toUpperCase() || "·"}
            </span>
            <span className="gallery-corner__contact-label">{t("studioContact.open")}</span>
          </button>
        )}
      </div>
      {open && hasContact(branding) && <ContactDialog branding={branding} onClose={close} />}
    </>
  );
}
