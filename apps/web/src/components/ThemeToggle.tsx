import { useEffect, useState } from "react";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { applyTheme, currentTheme, loadTheme, saveTheme, systemTheme, type Theme } from "../lib/theme";

/**
 * Light/dark switch. Until it is pressed the theme follows the operating system
 * (including when that changes at sunset); pressing it makes the choice stick.
 */
export function ThemeToggle() {
  const { t } = useLanguage();
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      if (loadTheme() === null) setTheme(systemTheme());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="link-button theme-toggle"
      aria-label={next === "dark" ? t("theme.toDark") : t("theme.toLight")}
      title={next === "dark" ? t("theme.toDark") : t("theme.toLight")}
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}
