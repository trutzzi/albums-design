import { useState, type CSSProperties, type FormEvent } from "react";
import { ApiError, unlockClientLink } from "@/shared/api";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { LANGUAGES } from "@/shared/i18n/translations";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

interface Props {
  kind: "review" | "download" | "pick";
  token: string;
  onUnlocked: () => void;
  /** Who sent the link, and their colour — shown before the password, never the shoot itself. */
  studio?: { name: string | null; accent: string | null } | undefined;
  /** A tiny copy of the cover to blur behind the form; omitted when there is none. */
  teaserUrl?: string | null | undefined;
}

/** True when an API failure means "this link needs its password". */
export function needsPassword(error: unknown): boolean {
  return error instanceof ApiError && error.code === "PASSWORD_REQUIRED";
}

/**
 * The page a client sees before a protected link opens. It never says whether
 * the link itself exists; it only asks for the password, and explains a wrong
 * one or a temporary lock in plain words.
 */
export function PasswordGate({ kind, token, onUnlocked, studio, teaserUrl }: Props) {
  const { t, language, setLanguage } = useLanguage();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A teaser that fails to load simply leaves the plain lock.
  const [teaserFailed, setTeaserFailed] = useState(false);
  const accentStyle = studio?.accent ? ({ "--accent": studio.accent } as CSSProperties) : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlockClientLink(kind, token, password);
      onUnlocked();
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : undefined;
      setError(
        code === "INVALID_PASSWORD"
          ? t("access.gate.invalid")
          : code === "TOO_MANY_ATTEMPTS"
            ? t("access.gate.locked")
            : t("access.gate.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page gate" style={accentStyle}>
      <div className="gate__top">
        {studio?.name ? <span className="gate__studio">{studio.name}</span> : <span />}
        <div className="pick__lang" role="group" aria-label={t("pick.language")}>
          <ThemeToggle />
          {LANGUAGES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`link-button ${language === option.value ? "pick__lang--on" : ""}`}
              onClick={() => setLanguage(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`gate__art ${teaserUrl && !teaserFailed ? "gate__art--photo" : ""}`}>
        {teaserUrl && !teaserFailed && (
          <img className="gate__teaser" src={teaserUrl} alt="" onError={() => setTeaserFailed(true)} />
        )}
        <span className="gate__lock" aria-hidden="true">
          <svg viewBox="0 0 28 28" width="26" height="26" fill="none">
            <rect x="6" y="12" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M9.5 12V9a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      </div>
      <div className="gate__intro">
        <h1>{t("access.gate.title")}</h1>
        <p className="muted">{t("access.gate.hint")}</p>
      </div>
      <form className="gate__card panel" onSubmit={submit}>
        <div className="field">
          <label htmlFor="gate-password">{t("access.gate.password")}</label>
          <input
            id="gate-password"
            type="text"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "gate-error gate-note" : "gate-note"}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span id="gate-note" className="gate__note">
            {t("access.gate.note")}
          </span>
        </div>
        {error && (
          <p id="gate-error" className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button--primary" disabled={busy || !password.trim()}>
          {busy ? t("access.gate.checking") : t("access.gate.submit")}
        </button>
      </form>
      <p className="gate__help">{t("access.gate.help")}</p>
    </div>
  );
}
