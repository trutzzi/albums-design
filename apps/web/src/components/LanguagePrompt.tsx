import { useLanguage } from "../lib/i18n/LanguageContext";
import { LANGUAGES } from "../lib/i18n/translations";

export interface LanguagePromptProps {
  /** Called once a language is picked — the caller resumes whatever it was doing (e.g. generating the album). */
  onChoose: () => void;
}

/**
 * Shown once, the first time a person generates an album, if they've never
 * explicitly picked a language — the natural moment to ask, rather than
 * interrupting sign-up before they've seen the product at all. Picking a
 * language here also satisfies it for good; this never shows again.
 */
export function LanguagePrompt({ onChoose }: LanguagePromptProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="language-prompt-title">
        <h2 id="language-prompt-title">{t("language.prompt.title")}</h2>
        <p>{t("language.prompt.body")}</p>
        <div className="print-profile-options">
          {LANGUAGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`print-profile-option ${language === option.value ? "print-profile-option--selected" : ""}`}
              onClick={() => setLanguage(option.value)}
            >
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
        <div className="modal__actions">
          <button type="button" className="button button--primary" onClick={onChoose}>
            {t("language.prompt.continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
