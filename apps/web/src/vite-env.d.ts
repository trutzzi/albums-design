/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_STUDIO_API_KEY?: string;
  readonly VITE_STUDIO_ID?: string;
  readonly VITE_PROJECT_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  /** Cloudflare Turnstile site key; unset hides the signup human check. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
