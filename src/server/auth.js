import {
  isAllowedDevOrigin,
  isLoopbackAddress,
  isTrustedHostHeader,
  isTrustedLanAddressString,
  normalizeAddress,
  requestHasTrustedOrigin,
} from "./networkTrust.js";
import { getProxyToken } from "./runtimeConfig.js";

export function isLoopbackRequest(req) {
  const candidates = [
    req.ip,
    req.socket?.remoteAddress,
  ]
    .map(normalizeAddress)
    .filter(Boolean);

  return candidates.some((value) => isLoopbackAddress(value));
}

export function isTrustedLanRequest(req) {
  const candidates = [
    req.ip,
    req.socket?.remoteAddress,
  ]
    .map(normalizeAddress)
    .filter(Boolean);

  return candidates.some((value) => isTrustedLanAddressString(value));
}

export function authCheck(req, res, next) {
  const token = getProxyToken();
  if (!token) return next();

  const header = req.headers.authorization;
  if (header !== `Bearer ${token}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Without PROXY_TOKEN the only thing standing between a web page and this
// API is the browser's same-origin policy — and DNS rebinding defeats it:
// attacker.example resolves to 127.0.0.1, so the page's fetch() is
// same-origin and carries Host: attacker.example. Rejecting any Host not in
// the trusted dev-host set closes that, and rejecting a state-changing
// request whose Origin is not an allowed app origin closes the cross-site
// POST case that `cors` (which only withholds headers) does not. With a
// bearer token configured the token is the boundary, so this is a no-op.
export function enforceTrustedHostAndOrigin(req, res, next) {
  if (getProxyToken()) return next();

  if (!isTrustedHostHeader(req.headers.host)) {
    return res.status(403).json({ error: "Untrusted Host header" });
  }

  const origin = req.headers.origin;
  if (origin && !SAFE_METHODS.has(req.method) && !isAllowedDevOrigin(origin)) {
    return res.status(403).json({ error: "Untrusted request origin" });
  }

  next();
}

export function requireProtectedConfigWrite(req, res, next) {
  const token = getProxyToken();
  if (token) {
    return authCheck(req, res, next);
  }

  if (isLoopbackRequest(req)) {
    return next();
  }

  if (isTrustedLanRequest(req) && requestHasTrustedOrigin(req) && isAllowedDevOrigin(req.headers.origin || req.headers.referer || "")) {
    return next();
  }

  return res.status(403).json({
    error: "Protected configuration writes require a trusted app origin on the local network or a bearer token",
  });
}
