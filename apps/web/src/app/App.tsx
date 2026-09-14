import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { ProjectsPage } from "../features/project/ProjectsPage";
import { ProjectPage } from "../features/project/ProjectPage";
import { AlbumEditorPage } from "../features/album-editor/AlbumEditorPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { StudioPage } from "../features/studio/StudioPage";

function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // The client portal is a different product surface — no studio chrome on it.
  const isReview = location.pathname.startsWith("/review/");

  return (
    <div className="app-shell">
      {!isReview && (
        <header className="app-header">
          <Link to="/" className="app-header__mark">
            AlbumFlow
          </Link>
          <nav className="app-header__nav">
            <Link to="/">Shoots</Link>
            <Link to="/studio">Studio</Link>
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
      <Shell>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/albums/:albumId" element={<AlbumEditorPage />} />
          <Route path="/review/:token" element={<ReviewPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="*" element={<p className="page muted">Page not found.</p>} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
