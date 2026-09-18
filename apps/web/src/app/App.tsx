import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { ProjectsPage } from "../features/project/ProjectsPage";
import { ProjectPage } from "../features/project/ProjectPage";
import { AlbumEditorPage } from "../features/album-editor/AlbumEditorPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { StudioPage } from "../features/studio/StudioPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { AuthProvider, useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const auth = useAuth();
  // The client portal and the auth pages are different product surfaces —
  // no studio chrome on either.
  const isReview = location.pathname.startsWith("/review/");
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";

  return (
    <div className="app-shell">
      {!isReview && !isAuthPage && (
        <header className="app-header">
          <Link to="/" className="app-header__mark">
            AlbumFlow
          </Link>
          <nav className="app-header__nav">
            <Link to="/">Shoots</Link>
            <Link to="/studio">Studio</Link>
            {auth.isAuthenticated ? (
              <button type="button" className="link-button" onClick={auth.logout}>
                Log out
              </button>
            ) : (
              <>
                <Link to="/login">Log in</Link>
                <Link to="/register">Sign up</Link>
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
      <AuthProvider>
        <Shell>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
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
    </BrowserRouter>
  );
}
