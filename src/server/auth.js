const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);

function normalizeAddress(address) {
  if (!address) return "";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function isPrivateIpv4(address) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return false;
  const [a, b] = address.split(".").map(Number);

  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isTrustedLanAddress(address) {
  if (!address) return false;
  if (LOOPBACK_ADDRESSES.has(address)) return true;
  if (isPrivateIpv4(address)) return true;
  return address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
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

  return candidates.some((value) => LOOPBACK_ADDRESSES.has(value));
}

export function isTrustedLanRequest(req) {
  const candidates = [
    req.ip,
    req.socket?.remoteAddress,
  ]
    .map(normalizeAddress)
    .filter(Boolean);

  return candidates.some((value) => isTrustedLanAddress(value));
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

  if (isTrustedLanRequest(req)) {
    return next();
  }

  return res.status(403).json({
    error: "Protected configuration writes require a trusted local-network request or bearer token",
  });
}
