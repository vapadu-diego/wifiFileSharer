/**
 * Browser name detection. Chromium-based browsers such as Brave intentionally
 * advertise Chrome's User-Agent, so the client sends this value along with
 * `register_user` and the server uses it instead of the header heuristic.
 * This module is safe to import on the server (no top-level `navigator` use).
 */

export const KNOWN_BROWSERS = [
  "Brave",
  "Firefox",
  "Edge",
  "Opera",
  "Vivaldi",
  "Samsung Internet",
  "Chrome",
  "Safari",
] as const;

export type BrowserName = (typeof KNOWN_BROWSERS)[number];

interface BraveNavigator extends Navigator {
  brave?: {
    isBrave?: () => Promise<boolean>;
  };
}

function detectFromUserAgent(ua: string): string {
  // Order matters: Chromium variants all carry "Chrome" in their UA
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR") || ua.includes("Opera")) return "Opera";
  if (ua.includes("Vivaldi")) return "Vivaldi";
  if (ua.includes("SamsungBrowser")) return "Samsung Internet";
  if (ua.includes("Brave")) return "Brave"; // Brave on iOS appends this token
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
}

/**
 * Synchronous best-effort detection. Brave injects `navigator.brave` before
 * page scripts run, so its presence is a reliable fast path.
 */
export function detectBrowserName(): string {
  if (typeof navigator === "undefined") return "Unknown";
  if ((navigator as BraveNavigator).brave) return "Brave";
  return detectFromUserAgent(navigator.userAgent);
}

/**
 * Confirms Brave through its official API before falling back to the UA
 * heuristic. Brave may hide the API from sites it considers hostile.
 */
export async function detectBrowserNameAsync(): Promise<string> {
  if (typeof navigator === "undefined") return "Unknown";
  const brave = (navigator as BraveNavigator).brave;
  if (brave?.isBrave) {
    try {
      if (await brave.isBrave()) return "Brave";
      return detectFromUserAgent(navigator.userAgent);
    } catch {
      // API blocked or unavailable — use the UA heuristic below
    }
  }
  return detectBrowserName();
}
