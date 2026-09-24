"use strict";
/**
 * Browser name detection. Chromium-based browsers such as Brave intentionally
 * advertise Chrome's User-Agent, so the client sends this value along with
 * `register_user` and the server uses it instead of the header heuristic.
 * This module is safe to import on the server (no top-level `navigator` use).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_BROWSERS = void 0;
exports.detectBrowserName = detectBrowserName;
exports.detectBrowserNameAsync = detectBrowserNameAsync;
exports.KNOWN_BROWSERS = [
    "Brave",
    "Firefox",
    "Edge",
    "Opera",
    "Vivaldi",
    "Samsung Internet",
    "Chrome",
    "Safari",
];
function detectFromUserAgent(ua) {
    // Order matters: Chromium variants all carry "Chrome" in their UA
    if (ua.includes("Firefox"))
        return "Firefox";
    if (ua.includes("Edg/"))
        return "Edge";
    if (ua.includes("OPR") || ua.includes("Opera"))
        return "Opera";
    if (ua.includes("Vivaldi"))
        return "Vivaldi";
    if (ua.includes("SamsungBrowser"))
        return "Samsung Internet";
    if (ua.includes("Brave"))
        return "Brave"; // Brave on iOS appends this token
    if (ua.includes("Chrome"))
        return "Chrome";
    if (ua.includes("Safari"))
        return "Safari";
    return "Unknown";
}
/**
 * Synchronous best-effort detection. Brave injects `navigator.brave` before
 * page scripts run, so its presence is a reliable fast path.
 */
function detectBrowserName() {
    if (typeof navigator === "undefined")
        return "Unknown";
    if (navigator.brave)
        return "Brave";
    return detectFromUserAgent(navigator.userAgent);
}
/**
 * Confirms Brave through its official API before falling back to the UA
 * heuristic. Brave may hide the API from sites it considers hostile.
 */
async function detectBrowserNameAsync() {
    if (typeof navigator === "undefined")
        return "Unknown";
    const brave = navigator.brave;
    if (brave?.isBrave) {
        try {
            if (await brave.isBrave())
                return "Brave";
            return detectFromUserAgent(navigator.userAgent);
        }
        catch {
            // API blocked or unavailable — use the UA heuristic below
        }
    }
    return detectBrowserName();
}
