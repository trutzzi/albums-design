import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ApiError, requestPasswordReset } from "@/shared/api";

export function ForgotPasswordPage() {
  const { t, language } = useLanguage();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="page auth-page">
      <img src="/images/photographer-ceremony.webp" alt="" className="auth-page__image" />
      <section className="panel auth-panel">
        <img src="/logo-full.png" alt="AlbumFlow Studio" className="auth-panel__logo" />
        <div className="panel__head">
          <h1>{t("auth.forgot.title")}</h1>
        </div>
        {sentTo ? (
          <p className="notice notice--good">{t("auth.forgot.sent", { email: sentTo })}</p>
        ) : (
          <>
            <p className="muted">{t("auth.forgot.subtitle")}</p>
            <form
              className="auth-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);
                setPending(true);
                try {
                  await requestPasswordReset(email, language);
                  setSentTo(email);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : t("auth.error.generic"));
                } finally {
                  setPending(false);
                }
              }}
            >
              <div className="field">
                <label htmlFor="forgot-email">{t("auth.forgot.email")}</label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="button button--primary" disabled={pending}>
                {pending ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
              </button>
            </form>
          </>
        )}
        <p className="muted">
          <Link to="/login">{t("auth.forgot.back")}</Link>
        </p>
      </section>
    </div>
  );
}
