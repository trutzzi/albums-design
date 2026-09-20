export type Theme = "light" | "dark";

const STORAGE_KEY = "albumflow.theme";

/** The person's explicit choice, or `null` while they have never made one. Storage can throw (private mode), so it is always guarded. */
export function loadTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not persisted — the choice still applies for this visit.
  }
}

export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Explicit choice first, then whatever the operating system is set to. */
export function currentTheme(): Theme {
  return loadTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
