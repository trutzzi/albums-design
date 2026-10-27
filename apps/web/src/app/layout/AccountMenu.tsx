import { useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { useAvailableTour } from "@/shared/ui/GuidedTour";
import { openHowItWorks } from "@/shared/ui/HowItWorks";
import { initials } from "./initials";
import { useDisclosure } from "./useDisclosure";

/**
 * The avatar at the end of the studio's bars. What is used now and then — the page's
 * guide, the overview, contact, logging out — lives behind it, so the bar itself keeps
 * only the board's four links. A disclosure (button + panel), not an ARIA menu: the
 * items are ordinary links and buttons and Tab moves through them.
 */
export function AccountMenu() {
  const auth = useAuth();
  const { t } = useLanguage();
  const tour = useAvailableTour();
  const { open, setOpen, ref } = useDisclosure<HTMLDivElement>();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="header-menu"
      ref={ref}
      onBlur={(event) => {
        // Tabbing out of the menu closes it, as pressing outside does.
        if (open && !ref.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        // Handled here so the phone menu around it stays open.
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="avatar-button"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={t("nav.account")}
        title={auth.name}
        data-tour="nav-account"
        onClick={() => setOpen((current) => !current)}
      >
        {initials(auth.name)}
      </button>
      {open && (
        <div
          id="account-menu"
          className="header-menu__panel"
          onClick={(event) => {
            if (!(event.target as HTMLElement).closest("a, button")) return;
            setOpen(false);
            // The chosen item unmounts with the panel; focus goes back to the avatar
            // rather than to the top of the page.
            buttonRef.current?.focus();
          }}
        >
          {auth.name.trim() && <p className="header-menu__who">{auth.name}</p>}
          {tour && (
            <button type="button" className="header-menu__item" onClick={tour.start}>
              {t("nav.guide")}
            </button>
          )}
          <button type="button" className="header-menu__item" onClick={openHowItWorks}>
            {t("howItWorks.nav")}
          </button>
          <Link to="/contact" className="header-menu__item">
            {t("nav.contact")}
          </Link>
          <button type="button" className="header-menu__item" onClick={auth.logout}>
            {t("nav.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
