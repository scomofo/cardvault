import { getOrigin } from "./permissions.js";

// Only these schemes are ever safe to hand to the OS's default-browser
// handler — file:, javascript:, and similar schemes could reach the local
// filesystem or renderer context if something ever got the renderer to
// call openExternal with an attacker-controlled URL.
const ALLOWED_EXTERNAL_SCHEMES = new Set(["https:", "http:", "mailto:"]);

export function isAllowedExternalUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (!ALLOWED_EXTERNAL_SCHEMES.has(protocol)) return false;
    // http: is only for the app's own loopback API (e.g. kicking off eBay
    // OAuth via the system browser); a plain http: link to a real host
    // would send credentials/cookies in the clear.
    if (protocol === "http:" && !["127.0.0.1", "localhost"].includes(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// The renderer only ever navigates within the app's own origin(s); anything
// else (an OAuth redirect target, a link inside a card image, a compromised
// renderer trying to load an attacker page into the main window) must be
// denied here and opened externally instead, where the preload bridge and
// IPC channels the app grants aren't attached.
export function isAllowedNavigation({ targetUrl, allowedOrigins }) {
  const origin = getOrigin(targetUrl);
  return !!origin && allowedOrigins.has(origin);
}
