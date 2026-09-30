import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { useLanguage } from "../../lib/i18n/LanguageContext";
import { ApiError } from "../../lib/api";

/** Where the link in the reset email lands: choose a new password, then straight into the app. */
export function ResetPasswordPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="page auth-page">
      <img src="/images/bouquet-album.webp" alt="" className="auth-page__image" />
      <section className="panel auth-panel">
        <img src="/logo-full.png" alt="AlbumFlow Studio" className="auth-panel__logo" />
        <div className="panel__head">
          <h1>{t("auth.reset.title")}</h1>
        </div>
        {!token ? (
          <p className="notice">{t("auth.reset.missingToken")}</p>
        ) : (
          <form
            className="auth-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (password !== confirm) {
                setError(t("auth.reset.mismatch"));
                return;
              }
              setError(null);
              setPending(true);
              try {
                await auth.resetPassword(token, password);
                navigate("/", { replace: true });
              } catch (err) {
                setError(err instanceof ApiError ? err.message : t("auth.error.generic"));
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="reset-password">{t("auth.reset.password")}</label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <span className="muted">{t("auth.register.passwordHint")}</span>
            </div>
            <div className="field">
              <label htmlFor="reset-confirm">{t("auth.reset.confirm")}</label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="button button--primary" disabled={pending}>
              {pending ? t("auth.reset.submitting") : t("auth.reset.submit")}
            </button>
          </form>
        )}
        <p className="muted">
          <Link to="/forgot-password">{t("auth.reset.requestNew")}</Link>
        </p>
      </section>
    </div>
  );
}
