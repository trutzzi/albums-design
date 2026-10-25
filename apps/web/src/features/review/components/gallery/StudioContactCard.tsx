import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientBrandingDTO } from "@albumflow/contracts";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { useDialogFocus } from "@/shared/ui/useDialogFocus";
import { useDismiss } from "@/shared/ui/useDismiss";
import { buildVCard, telUrl, whatsappUrl } from "@/features/review/lib/client-gallery";
import { SocialLinks } from "./SocialLinks";

/** Whether the studio filled in anything a client could use to reach them. */
export function hasContact(branding: ClientBrandingDTO | null): branding is ClientBrandingDTO {
  const social = branding?.style.social;
  return Boolean(
    branding &&
    (branding.phone || branding.email || branding.website || social?.instagram || social?.facebook || social?.tiktok),
  );
}

/**
 * The floating buttons in the corner of a client gallery: back to the top once the client
 * has scrolled, and "Contacts" — the studio's card with call, WhatsApp, email, the website,
 * and a vCard to save them to the phone's address book.
 */
export function GalleryCornerButtons({ branding }: { branding: ClientBrandingDTO | null }) {
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
            {t("studioContact.open")}
          </button>
        )}
      </div>
      {open && hasContact(branding) && <ContactDialog branding={branding} onClose={close} />}
    </>
  );
}

function ContactDialog({ branding, onClose }: { branding: ClientBrandingDTO; onClose: () => void }) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, closeRef);
  useDismiss(true, onClose);

  const saveContact = () => {
    const card = buildVCard({
      name: branding.name,
      title: t("studioContact.role"),
      phone: branding.phone,
      email: branding.email,
      website: branding.website,
    });
    const url = URL.createObjectURL(new Blob([card], { type: "text/vcard;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${branding.name.replace(/[^\w\- ]+/g, "").trim() || "contact"}.vcf`;
    link.click();
    // The click has handed the file to the browser; the object URL is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal contact-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-card-name"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="contact-card__close"
          aria-label={t("studioContact.close")}
          onClick={onClose}
        >
          ×
        </button>
        {branding.logo && <img src={branding.logo} alt="" className="contact-card__logo" />}
        <h2 id="contact-card-name" className="contact-card__name">
          {branding.name}
        </h2>
        <p className="contact-card__role">{t("studioContact.role")}</p>
        {branding.phone && (
          <a className="contact-card__phone" href={telUrl(branding.phone)}>
            {branding.phone}
          </a>
        )}
        {branding.email && (
          <a className="contact-card__email" href={`mailto:${branding.email}`}>
            {branding.email}
          </a>
        )}
        <div className="contact-card__actions">
          {branding.phone && (
            <a className="button" href={whatsappUrl(branding.phone)} target="_blank" rel="noopener noreferrer">
              {t("studioContact.whatsapp")}
            </a>
          )}
          <button type="button" className="button button--primary" onClick={saveContact}>
            {t("studioContact.save")}
          </button>
        </div>
        <SocialLinks social={branding.style.social} />
        {branding.website && (
          <a className="contact-card__website" href={branding.website} target="_blank" rel="noopener noreferrer">
            {t("studioContact.website")}
          </a>
        )}
      </div>
    </div>
  );
}
