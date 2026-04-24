import { networkInterfaces } from "node:os";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);

export function normalizeAddress(address) {
  if (!address) return "";
  return address.startsWith("::ffff:") ? address.slice(7).toLowerCase() : address.toLowerCase();
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

export function isLoopbackAddress(address) {
  return LOOPBACK_ADDRESSES.has(normalizeAddress(address));
}

export function isTrustedLanAddressString(address) {
  return isTrustedLanAddress(normalizeAddress(address));
}

export function getTrustedDevHosts() {
  const hosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const configuredHost = normalizeAddress(process.env.DEV_HOSTNAME?.trim() || "");
  const boundHost = normalizeAddress(process.env.HOST?.trim() || "");

  if (configuredHost) hosts.add(configuredHost);
  if (boundHost && boundHost !== "0.0.0.0" && boundHost !== "::") hosts.add(boundHost);

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.internal) continue;
      if (entry.family !== "IPv4" && entry.family !== "IPv6") continue;
      hosts.add(normalizeAddress(entry.address));
    }
  }

  return hosts;
}

function extractOriginHost(value) {
  if (!value || typeof value !== "string") return "";
  try {
    return normalizeAddress(new URL(value).hostname);
  } catch {
    return "";
  }
}

export function isAllowedDevOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    if (!["http:", "https:"].includes(protocol)) return false;
    return getTrustedDevHosts().has(normalizeAddress(hostname));
  } catch {
    return false;
  }
}

export function requestHasTrustedOrigin(req) {
  const originHost = extractOriginHost(req.headers.origin);
  const refererHost = extractOriginHost(req.headers.referer);
  const trustedHosts = getTrustedDevHosts();

  if (originHost) return trustedHosts.has(originHost);
  if (refererHost) return trustedHosts.has(refererHost);
  return false;
}
