const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);

function normalizeAddress(address) {
  if (!address) return "";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
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

  return res.status(403).json({
    error: "Protected configuration writes require a local request or bearer token",
  });
}
