import { useRef } from "react";
import { LANGUAGES } from "@/shared/i18n/translations";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { useTheme } from "@/shared/ui/ThemeToggle";
import { useDisclosure } from "./useDisclosure";

const THEMES = ["light", "dark"] as const;

/** "EN · Light": the studio's language and theme, read at a glance and changed in two taps. */
export function PrefsMenu() {
  const { t, language, setLanguage } = useLanguage();
  const [theme, setTheme] = useTheme();
  const { open, setOpen, ref, onBlur } = useDisclosure<HTMLDivElement>();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="header-menu"
      ref={ref}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="header-chip"
        aria-expanded={open}
        aria-controls="prefs-menu"
        aria-label={t("nav.prefs")}
        onClick={() => setOpen((current) => !current)}
      >
        {language.toUpperCase()} · {t(`theme.${theme}`)}
      </button>
      {open && (
        <div id="prefs-menu" className="header-menu__panel">
          <fieldset className="header-menu__group">
            <legend>{t("language.settings.title")}</legend>
            {LANGUAGES.map((option) => (
              <label key={option.value} className="header-menu__choice">
                <input
                  type="radio"
                  name="header-language"
                  checked={language === option.value}
                  onChange={() => setLanguage(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="header-menu__group">
            <legend>{t("theme.title")}</legend>
            {THEMES.map((option) => (
              <label key={option} className="header-menu__choice">
                <input type="radio" name="header-theme" checked={theme === option} onChange={() => setTheme(option)} />
                {t(`theme.${option}`)}
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </div>
  );
}
