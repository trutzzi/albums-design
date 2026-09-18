import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { ApiError } from "../../lib/api";

export function RegisterPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="page auth-page">
      <section className="panel auth-panel">
        <img src="/logo-full.png" alt="AlbumFlow Studio" className="auth-panel__logo" />
        <div className="panel__head">
          <h1>{t("auth.register.title")}</h1>
        </div>
        <p className="muted">{t("auth.register.subtitle")}</p>
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setPending(true);
            try {
              await auth.register(name, email, password);
              navigate("/", { replace: true });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : t("auth.error.generic"));
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
          {error && <p className="error">{error}</p>}
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>
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
