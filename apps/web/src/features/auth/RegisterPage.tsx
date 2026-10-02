import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ApiError, resendConfirmation } from "@/shared/api";
import { Turnstile, TURNSTILE_SITE_KEY } from "@/features/auth/components/Turnstile";

export function RegisterPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Bots fill in every field; people never see this one.
  const [website, setWebsite] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  return (
    <div className="page auth-page">
      <img src="/images/bouquet-album.webp" alt="" className="auth-page__image" />
      <section className="panel auth-panel">
        <img src="/logo-full.png" alt="AlbumFlow Studio" className="auth-panel__logo" />
        <div className="panel__head">
          <h1>{t("auth.register.title")}</h1>
        </div>
        {sentTo ? (
          <div className="auth-form">
            <p className="notice notice--good" role="status">{t("auth.confirm.sent", { email: sentTo })}</p>
            <p className="muted">{t("auth.confirm.spam")}</p>
            <button
              type="button"
              className="button"
              disabled={resent}
              onClick={async () => {
                await resendConfirmation(sentTo, language).catch(() => undefined);
                setResent(true);
              }}
            >
              {resent ? t("auth.confirm.resent") : t("auth.confirm.resend")}
            </button>
          </div>
        ) : (
        <>
        <p className="muted">{t("auth.register.subtitle")}</p>
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setPending(true);
            try {
              await auth.register(name, email, password, {
                language,
                website,
                ...(captchaToken ? { captchaToken } : {}),
              });
              setSentTo(email.trim().toLowerCase());
            } catch (err) {
              setError(err instanceof ApiError ? err.message : t("auth.error.generic"));
              // Each token works once: a failed attempt needs a fresh check.
              setCaptchaReset((value) => value + 1);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="register-name">{t("auth.register.name")}</label>
            <input
              id="register-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="register-email">{t("auth.register.email")}</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="register-password">{t("auth.register.password")}</label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="muted">{t("auth.register.passwordHint")}</span>
          </div>
          <div className="auth-form__trap" aria-hidden="true">
            <label htmlFor="register-website">Website</label>
            <input
              id="register-website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
          <Turnstile onToken={setCaptchaToken} language={language} resetKey={captchaReset} />
          {error && <p className="error">{error}</p>}
          <button
            type="submit"
            className="button button--primary"
            disabled={pending || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
          >
            {pending ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>
        </>
        )}
        <p className="muted">
          {t("auth.register.haveAccount")} <Link to="/login">{t("auth.register.login")}</Link>
        </p>
        <p className="muted">
          <Link to="/changelog">{t("auth.login.seeChangelog")}</Link>
        </p>
      </section>
    </div>
  );
}
