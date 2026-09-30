import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { LandingPage } from "../features/marketing/LandingPage";
import { ProjectsPage } from "../features/project/ProjectsPage";
import { ProjectPage } from "../features/project/ProjectPage";
import { AlbumEditorPage } from "../features/album-editor/AlbumEditorPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { PickPage } from "../features/review/PickPage";
import { DownloadPage } from "../features/review/DownloadPage";
import { AppHeader } from "../components/AppHeader";
import { StudioPage } from "../features/studio/StudioPage";
import { AdminPage } from "../features/admin/AdminPage";
import { ChangelogPage } from "../features/changelog/ChangelogPage";
import { ContactPage } from "../features/marketing/ContactPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "../features/auth/VerifyEmailPage";
import { AuthProvider, useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";
import { LanguageProvider, useLanguage } from "../lib/i18n/LanguageContext";

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // The client portal and the auth pages are different product surfaces —
  // no studio chrome on either.
  const isReview =
    location.pathname.startsWith("/review/") ||
    location.pathname.startsWith("/pick/") ||
    location.pathname.startsWith("/download/");
  const isAuthPage = AUTH_PAGES.includes(location.pathname);

  return (
    <div className="app-shell">
      {!isReview && !isAuthPage && <AppHeader />}
      {children}
    </div>
  );
}

/** Signed in sees their shoots; a prospective user sees the pitch instead of a login wall. */
function HomeRoute() {
  const auth = useAuth();
  return auth.isAuthenticated ? <ProjectsPage /> : <LandingPage />;
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
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              {/* Public: a prospective user reads this before ever signing up. */}
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/review/:token" element={<ReviewPage />} />
              <Route path="/pick/:token" element={<PickPage />} />
              <Route path="/download/:token" element={<DownloadPage />} />
              <Route path="/" element={<HomeRoute />} />
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
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <AdminPage />
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
