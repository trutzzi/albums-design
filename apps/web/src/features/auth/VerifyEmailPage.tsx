import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { useLanguage } from "@/shared/i18n/LanguageContext";
import { ApiError } from "@/shared/api";
import { AuthPhoto } from "@/features/auth/components/AuthPhoto";

/** Where the link in the confirmation email lands: opens the account, then straight into the app. */
export function VerifyEmailPage() {
  const auth = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState<string | null>(token ? null : t("auth.confirm.missingToken"));
  // React's development double-run of effects must not spend the link twice.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    auth
      .verifyEmail(token)
      .then(() => navigate("/", { replace: true }))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : t("auth.error.generic")));
  }, [auth, token, navigate, t]);

  return (
    <div className="page auth-page">
      <AuthPhoto src="/images/bouquet-album.webp" />
      <section className="panel auth-panel">
        <img src="/logo-full.png" alt="AlbumFlow Studio" className="auth-panel__logo" />
        <div className="panel__head">
          <h1>{t("auth.confirm.title")}</h1>
        </div>
        {error ? <p className="error">{error}</p> : <p className="muted">{t("auth.confirm.checking")}</p>}
        <p className="muted">
          <Link to="/login">{t("auth.register.login")}</Link>
        </p>
      </section>
    </div>
  );
}
