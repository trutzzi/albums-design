import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAdminMe } from "@/shared/api";
import { FeedbackButton } from "./FeedbackButton";
import { useAuth } from "@/app/AuthContext";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { AccountMenu } from "./AccountMenu";
import { HeaderSearch } from "./HeaderSearch";
import { LanguageSwitch } from "./LanguageSwitch";
import { PrefsMenu } from "./PrefsMenu";

/**
 * The top bar, as on the Landing and Studio boards. A visitor sees the site's sections,
 * EN · RO and the way in; the studio sees its four places, a search, feedback, its
 * language and theme, and an avatar holding the rest. Below ~820px the links fold into
 * a menu opened by a button: a full-width panel with large tap targets. Everything that
 * closes it is local to this component — the button, a backdrop element, choosing a
 * link, a route change, and Escape while focus is inside the header — rather than a
 * listener on the whole document.
 */
export function AppHeader() {
  const location = useLocation();
  const auth = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const adminMe = useQuery({
    queryKey: ["admin-me", auth.studioId],
    queryFn: getAdminMe,
    enabled: auth.isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Navigating anywhere (including back/forward) leaves the menu closed.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <>
      {open && <div className="app-header__backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
      <header
        className={`app-header ${open ? "app-header--open" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <Link to="/" className="app-header__mark">
          <img src="/logo-icon.png" alt="" className="app-header__logo" />
          AlbumFlow
        </Link>

        <div
          id="app-nav"
          className={`app-header__nav ${open ? "app-header__nav--open" : ""}`}
          // A tap on any link or button inside the menu is a choice: close it.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a, button")) setOpen(false);
          }}
        >
          {auth.isAuthenticated ? (
            <>
              <nav className="app-header__links" aria-label={t("nav.main")}>
                <NavLink to="/" end>
                  {t("nav.shoots")}
                </NavLink>
                <NavLink to="/studio" data-tour="nav-studio">
                  {t("nav.studio")}
                </NavLink>
                {adminMe.data?.admin && <NavLink to="/admin">{t("nav.admin")}</NavLink>}
                <NavLink to="/changelog">{t("nav.changelog")}</NavLink>
              </nav>
              <div className="app-header__end">
                <HeaderSearch />
                <FeedbackButton />
              </div>
            </>
          ) : (
            <>
              <nav className="app-header__links" aria-label={t("nav.main")}>
                <Link to={{ pathname: "/", hash: "#how" }}>{t("howItWorks.nav")}</Link>
                <Link to={{ pathname: "/", hash: "#pricing" }}>{t("nav.pricing")}</Link>
                <NavLink to="/changelog">{t("nav.changelog")}</NavLink>
                <NavLink to="/contact">{t("nav.contact")}</NavLink>
              </nav>
              <div className="app-header__end">
                <LanguageSwitch />
                <Link to="/login">{t("nav.login")}</Link>
                <Link to="/register" className="app-header__signup">
                  {t("nav.signup")}
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="app-header__tools">
          {auth.isAuthenticated ? (
            <>
              <PrefsMenu />
              <AccountMenu />
            </>
          ) : (
            <ThemeToggle />
          )}
          <button
            type="button"
            className="app-header__menu-button"
            aria-expanded={open}
            aria-controls="app-nav"
            aria-label={open ? t("nav.menu.close") : t("nav.menu.open")}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="app-header__burger" aria-hidden="true" />
          </button>
        </div>
      </header>
    </>
  );
}
