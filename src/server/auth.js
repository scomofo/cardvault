import {
  isAllowedDevOrigin,
  isLoopbackAddress,
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
