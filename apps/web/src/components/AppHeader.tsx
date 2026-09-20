import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { ThemeToggle } from "./ThemeToggle";

/** A warm, time-of-day greeting — the kind of touch a boutique studio owner would want their own tool to have. */
function greetingKeyForHour(hour: number): string {
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  if (hour < 22) return "greeting.evening";
  return "greeting.night";
}

/**
 * The studio's top bar. On a wide screen it is the familiar row of links. Below
 * ~820px the links would not fit (they used to run off the edge and make the whole
 * page scroll sideways), so they fold into a menu opened by a button: a full-width
 * panel with large tap targets. Everything that closes it is local to this component
 * — the button, a backdrop element, choosing a link, a route change, and Escape while
 * focus is inside the header — rather than a listener on the whole document.
 */
export function AppHeader() {
  const location = useLocation();
  const auth = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const firstName = auth.name.trim().split(/\s+/)[0];
  const greeting =
    auth.isAuthenticated && firstName
      ? `${t(greetingKeyForHour(new Date().getHours()))}, ${firstName} 👋`
      : null;

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
        {greeting && <p className="app-header__greeting">{greeting}</p>}

        <nav
          id="app-nav"
          className={`app-header__nav ${open ? "app-header__nav--open" : ""}`}
          // A tap on any link or button inside the menu is a choice: close it.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a, button")) setOpen(false);
          }}
        >
          {greeting && <p className="app-header__greeting app-header__greeting--menu">{greeting}</p>}
          {auth.isAuthenticated && <Link to="/">{t("nav.shoots")}</Link>}
          {auth.isAuthenticated && <Link to="/studio">{t("nav.studio")}</Link>}
          <Link to="/changelog">{t("nav.changelog")}</Link>
          <Link to="/contact">{t("nav.contact")}</Link>
          {auth.isAuthenticated ? (
            <button type="button" className="link-button" onClick={auth.logout}>
              {t("nav.logout")}
            </button>
          ) : (
            <>
              <Link to="/login">{t("nav.login")}</Link>
              <Link to="/register">{t("nav.signup")}</Link>
            </>
          )}
        </nav>

        <div className="app-header__tools">
          <ThemeToggle />
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
