import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "@/shared/i18n/LanguageContext";

/**
 * "Search shoots or clients". The words live in the address (`/?q=`), so the shoots
 * list filters as you type, the search survives a reload, and typing it from any other
 * page opens the list already filtered.
 */
export function HeaderSearch() {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onShoots = location.pathname === "/";
  const fromAddress = onShoots ? (params.get("q") ?? "") : "";
  // What is typed is held here and follows the address only when the address changes
  // (Back, leaving the list). Bound to the address directly, a fast second keystroke
  // typed from another page landed before the first had arrived and replaced it.
  const [text, setText] = useState(fromAddress);
  const [seen, setSeen] = useState(fromAddress);
  if (fromAddress !== seen) {
    setSeen(fromAddress);
    setText(fromAddress);
  }

  const search = (next: string) => {
    setText(next);
    const query = next ? `?q=${encodeURIComponent(next)}` : "";
    // Each keystroke replaces the entry, so Back leaves the list instead of un-typing.
    navigate(`/${query}`, { replace: onShoots });
  };

  return (
    <label className="header-search">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="visually-hidden">{t("projects.search")}</span>
      <input
        type="search"
        value={text}
        placeholder={t("nav.search.placeholder")}
        onChange={(event) => search(event.target.value)}
      />
    </label>
  );
}
