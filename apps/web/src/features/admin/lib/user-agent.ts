/**
 * A browser's user-agent string, read the way a person would scan it: "Chrome · Windows",
 * or the tool that made the request ("curl", "Python") — scripts rarely pretend well.
 */
export function browserLabel(userAgent: string | null): string {
  if (!userAgent) return "No browser named";
  const ua = userAgent.toLowerCase();
  const tool = [
    ["curl", "curl"],
    ["wget", "Wget"],
    ["python", "Python"],
    ["go-http-client", "Go"],
    ["node-fetch", "Node"],
    ["axios", "Node"],
    ["headlesschrome", "Headless Chrome"],
  ].find(([needle]) => ua.includes(needle!));
  if (tool) return tool[1]!;
  // Crawlers name themselves "Googlebot/2.1", "AhrefsBot/7.0": "bot" right before a version.
  // A bare "bot" would also catch real phones, like the Cubot ones.
  if (/bot\/|crawler|spider/.test(ua)) return "Bot";

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("opr/") || ua.includes("opera")
      ? "Opera"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("chrome/") || ua.includes("crios/")
          ? "Chrome"
          : ua.includes("safari/")
            ? "Safari"
            : "Other browser";
  const system =
    ua.includes("iphone") || ua.includes("ipad")
      ? "iOS"
      : ua.includes("android")
        ? "Android"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("mac os")
            ? "macOS"
            : ua.includes("linux")
              ? "Linux"
              : null;
  return system ? `${browser} · ${system}` : browser;
}

/** The first language a browser asks for, "ro-RO,ro;q=0.9" → "ro-RO". */
export function firstLanguage(acceptLanguage: string | null): string | null {
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim();
  return first || null;
}
