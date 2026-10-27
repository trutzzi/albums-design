import { LANGUAGES } from "@/shared/i18n/translations";
import { useLanguage } from "@/shared/i18n/LanguageContext";

/** The visitor's "EN · RO": one press switches to the other language, and the current one is bold. */
export function LanguageSwitch() {
  const { t, language, setLanguage } = useLanguage();
  const other = LANGUAGES.find((option) => option.value !== language) ?? LANGUAGES[0]!;
  return (
    <button
      type="button"
      className="header-chip"
      aria-label={t("language.switchTo", { language: other.label })}
      onClick={() => setLanguage(other.value)}
    >
      {LANGUAGES.map((option, index) => (
        <span key={option.value}>
          {index > 0 && " · "}
          {option.value === language ? <strong>{option.value.toUpperCase()}</strong> : option.value.toUpperCase()}
        </span>
      ))}
    </button>
  );
}
