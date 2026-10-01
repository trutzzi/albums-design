import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ApiError, resendConfirmation } from "@/shared/api";

export function LoginPage() {
  const auth = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  return (
    <div className="page auth-page">
      <img src="/images/photographer-ceremony.webp" alt="" className="auth-page__image" />
      <section className="panel auth-panel">
        <img src="/logo-full.png" alt="AlbumFlow Studio" className="auth-panel__logo" />
        <div className="panel__head">
          <h1>{t("auth.login.title")}</h1>
        </div>
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setUnconfirmed(false);
            setPending(true);
            try {
              await auth.login(email, password);
              navigate(redirectTo, { replace: true });
            } catch (err) {
              if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
                setUnconfirmed(true);
                setResent(false);
              } else {
                setError(err instanceof ApiError ? err.message : t("auth.error.generic"));
              }
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="login-email">{t("auth.login.email")}</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">{t("auth.login.password")}</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Link to="/forgot-password" className="auth-form__forgot">
              {t("auth.login.forgot")}
            </Link>
          </div>
          {error && <p className="error">{error}</p>}
          {unconfirmed && (
            <div className="notice" role="alert">
              <p>{t("auth.confirm.required")}</p>
              <button
                type="button"
                className="button button--small"
                disabled={resent}
                onClick={async () => {
                  await resendConfirmation(email, language).catch(() => undefined);
                  setResent(true);
                }}
              >
                {resent ? t("auth.confirm.resent") : t("auth.confirm.resend")}
              </button>
            </div>
          )}
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>
        <p className="muted">
          {t("auth.login.newHere")} <Link to="/register">{t("auth.login.createAccount")}</Link>
        </p>
        <p className="muted">
          <Link to="/changelog">{t("auth.login.seeChangelog")}</Link>
        </p>
      </section>
    </div>
  );
}
