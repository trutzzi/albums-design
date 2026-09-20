import type { TrayDensity } from "./tray-grid";

export interface TrayPrefs {
  density: TrayDensity;
  /** A wider sidebar, so more thumbnails fit across. */
  wide: boolean;
}

const KEY = "albumflow.trayPrefs";
export const DEFAULT_TRAY_PREFS: TrayPrefs = { density: "m", wide: false };

/** Remembered per browser. Storage can throw (private mode) and can hold anything, so it is guarded and validated. */
export function loadTrayPrefs(): TrayPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_TRAY_PREFS;
    const parsed = JSON.parse(raw) as Partial<TrayPrefs>;
    return {
      density: parsed.density === "s" || parsed.density === "m" || parsed.density === "l" ? parsed.density : "m",
      wide: parsed.wide === true,
    };
  } catch {
    return DEFAULT_TRAY_PREFS;
  }
}

export function saveTrayPrefs(prefs: TrayPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered — the choice still applies for this visit.
  }
}
