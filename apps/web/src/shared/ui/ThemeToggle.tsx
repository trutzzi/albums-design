import { useEffect, useState } from "react";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { applyTheme, currentTheme, loadTheme, saveTheme, systemTheme, type Theme } from "@/shared/lib/theme";

/**
 * The theme on screen and a way to choose one. Until a choice is made it follows the
 * operating system (including when that changes at sunset); choosing makes it stick.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
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

  const choose = (next: Theme) => {
    saveTheme(next);
    setTheme(next);
  };
  return [theme, choose];
}

/** Light/dark switch, for the pages without the studio's language and theme menu. */
export function ThemeToggle() {
  const { t } = useLanguage();
  const [theme, choose] = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="link-button theme-toggle"
      aria-label={next === "dark" ? t("theme.toDark") : t("theme.toLight")}
      title={next === "dark" ? t("theme.toDark") : t("theme.toLight")}
      onClick={() => choose(next)}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}
