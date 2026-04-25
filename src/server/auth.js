import crypto from 'crypto';
import { get } from './database.js';
import {
  isAllowedDevOrigin,
  isLoopbackAddress,
  isTrustedLanAddressString,
  normalizeAddress,
  requestHasTrustedOrigin,
} from "./networkTrust.js";

// In-memory session store: token -> expiresAt (ms)
const sessions = new Map();

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createSession(token, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  sessions.set(token, Date.now() + ttlMs);
}

export function validateSession(token) {
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function deleteSession(token) {
  sessions.delete(token);
}

export function requireSession(req, res, next) {
  let passwordRow;
  try {
    passwordRow = get("SELECT value FROM settings WHERE key = 'seller_password'");
  } catch {
    // settings table may not be ready yet
    passwordRow = null;
  }

  if (!passwordRow?.value) {
    // No password configured — open mode
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || !validateSession(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.sessionToken = token;
  next();
}

function getProxyToken() {
  return process.env.PROXY_TOKEN?.trim() || "";
}

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
