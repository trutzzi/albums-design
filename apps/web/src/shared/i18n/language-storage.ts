import type { Language } from "./translations";

const LANGUAGE_KEY = "albumflow.language";

export function loadLanguage(): Language | null {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === "en" || value === "ro" ? value : null;
  } catch {
    // Private browsing, blocked storage, etc. — behave as never chosen.
    return null;
  }
}

export function saveLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Nothing to fall back to; the choice just won't survive a reload.
  }
}
