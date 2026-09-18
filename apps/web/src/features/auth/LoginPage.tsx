import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { ApiError } from "../../lib/api";

export function LoginPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  return (
    <div className="page auth-page">
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
            setPending(true);
            try {
              await auth.login(email, password);
              navigate(redirectTo, { replace: true });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : t("auth.error.generic"));
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
          </div>
          {error && <p className="error">{error}</p>}
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
