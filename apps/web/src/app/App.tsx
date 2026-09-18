import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { ProjectsPage } from "../features/project/ProjectsPage";
import { ProjectPage } from "../features/project/ProjectPage";
import { AlbumEditorPage } from "../features/album-editor/AlbumEditorPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { StudioPage } from "../features/studio/StudioPage";
import { ChangelogPage } from "../features/changelog/ChangelogPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { AuthProvider, useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";
import { LanguageProvider, useLanguage } from "../lib/i18n/LanguageContext";

/** A warm, time-of-day greeting — the kind of touch a boutique studio owner would want their own tool to have. */
function greetingKeyForHour(hour: number): string {
  if (hour < 5) return "greeting.night";
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  if (hour < 22) return "greeting.evening";
  return "greeting.night";
}

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const auth = useAuth();
  const { t } = useLanguage();
  // The client portal and the auth pages are different product surfaces —
  // no studio chrome on either.
  const isReview = location.pathname.startsWith("/review/");
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";
  const firstName = auth.name.trim().split(/\s+/)[0];

  return (
    <div className="app-shell">
      {!isReview && !isAuthPage && (
        <header className="app-header">
          <Link to="/" className="app-header__mark">
            <img src="/logo-icon.png" alt="" className="app-header__logo" />
            AlbumFlow
          </Link>
          {auth.isAuthenticated && firstName && (
            <p className="app-header__greeting">
              {t(greetingKeyForHour(new Date().getHours()))}, {firstName} 👋
            </p>
          )}
          <nav className="app-header__nav">
            <Link to="/">{t("nav.shoots")}</Link>
            <Link to="/studio">{t("nav.studio")}</Link>
            <Link to="/changelog">{t("nav.changelog")}</Link>
            {auth.isAuthenticated ? (
              <button type="button" className="link-button" onClick={auth.logout}>
                {t("nav.logout")}
              </button>
            ) : (
              <>
                <Link to="/login">{t("nav.login")}</Link>
                <Link to="/register">{t("nav.signup")}</Link>
              </>
            )}
          </nav>
        </header>
      )}
      {children}
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <Shell>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              {/* Public: a prospective user reads this before ever signing up. */}
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/review/:token" element={<ReviewPage />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <ProjectsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/projects/:projectId"
                element={
                  <RequireAuth>
                    <ProjectPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/albums/:albumId"
                element={
                  <RequireAuth>
                    <AlbumEditorPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/studio"
                element={
                  <RequireAuth>
                    <StudioPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<p className="page muted">Page not found.</p>} />
            </Routes>
          </Shell>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
