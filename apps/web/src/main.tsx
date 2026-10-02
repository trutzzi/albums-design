import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/app/App";
import "./styles.css";
import { applyTheme, currentTheme } from "@/shared/lib/theme";
import { ErrorBoundary, startErrorMonitoring } from "@/shared/lib/monitoring";

startErrorMonitoring();
applyTheme(currentTheme());

const queryClient = new QueryClient();

/** Shown instead of a blank page when rendering throws. Plain English: translations may be what broke. */
function CrashNotice() {
  return (
    <div className="page">
      <section className="panel">
        <h1>Something went wrong</h1>
        <p className="muted">The page hit an unexpected error. Reloading usually fixes it.</p>
        <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary fallback={<CrashNotice />}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
