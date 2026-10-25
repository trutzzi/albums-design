import { useEffect } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

/**
 * Keeps the screen on while `active`. Best effort: browsers without the API, or that
 * refuse (battery saver), just let the screen sleep as usual. The browser drops the
 * lock whenever the tab is hidden, so callers pass `active` false then and true again
 * on return, which asks anew.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!active || !wakeLock) return;
    let sentinel: WakeLockSentinelLike | undefined;
    let cancelled = false;
    wakeLock
      .request("screen")
      .then((lock) => {
        if (cancelled) void lock.release().catch(() => {});
        else sentinel = lock;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
