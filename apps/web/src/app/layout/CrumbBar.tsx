import type { ReactNode, Ref } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { AccountMenu } from "./AccountMenu";

interface CrumbBarProps {
  /** Where "‹" goes, and what it is called there. */
  back: { to: string; label: string };
  /** The page itself, after the slash. */
  current: ReactNode;
  /** The page's own controls, at the right before the avatar (the editor's tools). */
  children?: ReactNode;
  className?: string;
  ref?: Ref<HTMLElement>;
}

/**
 * The slim bar inside a shoot and the album editor, in place of the studio's header:
 * logo · ‹ Shoots / Elena & Radu. The avatar stays, so the page's guide and logging out
 * are as close as on any other page.
 */
export function CrumbBar({ back, current, children, className = "", ref }: CrumbBarProps) {
  const { t } = useLanguage();
  return (
    <header className={`crumb-bar ${className}`} ref={ref}>
      <Link to="/" className="crumb-bar__mark" aria-label={t("nav.home")}>
        <img src="/logo-icon.png" alt="" className="app-header__logo" />
      </Link>
      <nav className="crumb-bar__trail" aria-label={t("nav.breadcrumb")}>
        <Link to={back.to} className="crumb-bar__back">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {back.label}
        </Link>
        <span className="crumb-bar__slash" aria-hidden="true">
          /
        </span>
        <span className="crumb-bar__current" aria-current="page">
          {current}
        </span>
      </nav>
      {children && <div className="crumb-bar__tools">{children}</div>}
      <AccountMenu />
    </header>
  );
}
