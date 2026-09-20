import { useState, type FormEvent } from "react";
import { ApiError, unlockClientLink } from "../lib/api";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { LANGUAGES } from "../lib/i18n/translations";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  kind: "review" | "download" | "pick";
  token: string;
  onUnlocked: () => void;
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
export function PasswordGate({ kind, token, onUnlocked }: Props) {
  const { t, language, setLanguage } = useLanguage();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="page gate">
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
      <form className="gate__card panel" onSubmit={submit}>
        <h1>{t("access.gate.title")}</h1>
        <p className="muted">{t("access.gate.hint")}</p>
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
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button--primary" disabled={busy || !password.trim()}>
          {busy ? t("access.gate.checking") : t("access.gate.submit")}
        </button>
      </form>
    </div>
  );
}
