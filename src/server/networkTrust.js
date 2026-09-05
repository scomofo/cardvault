import { networkInterfaces } from "node:os";

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// An IPv4-mapped IPv6 address ("::ffff:127.0.0.1"). The WHATWG URL parser
// serialises the dotted form as hex ("[::ffff:7f00:1]"), so both spellings
// have to collapse back to the IPv4 address they name — otherwise
// http://[::ffff:127.0.0.1]/ reaches loopback while looking like a
// public IPv6 host to the checks below.
function ipv4FromMappedIpv6(address) {
  if (!address.startsWith("::ffff:")) return null;
  const rest = address.slice(7);
  if (IPV4_LITERAL.test(rest)) return rest;
  const hex = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

export function normalizeAddress(address) {
  if (!address) return "";
  // URL.hostname brackets an IPv6 literal ("[::1]"); every other caller here
  // (req.ip, req.socket.remoteAddress) never does, so strip it up front —
  // otherwise a bracketed loopback/LAN address never matches the bare form
  // this file's Sets and comparisons use.
  const unbracketed = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  const lowered = unbracketed.toLowerCase();
  return ipv4FromMappedIpv6(lowered) || lowered;
}

function isLoopbackIpv4(address) {
  return IPV4_LITERAL.test(address) && address.split(".")[0] === "127";
}

// "Non-public" rather than strictly "private": also covers link-local
// (169.254.0.0/16 — the address block cloud metadata endpoints like
// 169.254.169.254 live on), the whole loopback and "this network" blocks
// (127.0.0.0/8, 0.0.0.0/8), carrier-grade NAT (100.64.0.0/10) and the IETF
// protocol-assignments block (192.0.0.0/24), all of which matter for
// outboundUrlGuard.js rejecting SSRF targets, not just for classifying
// trusted LAN callers.
function isNonPublicIpv4(address) {
  if (!IPV4_LITERAL.test(address)) return false;
  const [a, b, c] = address.split(".").map(Number);

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 169 && b === 254)
  );
}

function isTrustedLanAddress(address) {
  if (!address) return false;
  if (address === "::1" || address === "::") return true;
  if (isNonPublicIpv4(address)) return true;
  return address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
}

export function isLoopbackAddress(address) {
  const normalized = normalizeAddress(address);
  return normalized === "::1" || isLoopbackIpv4(normalized);
}

export function isTrustedLanAddressString(address) {
  return isTrustedLanAddress(normalizeAddress(address));
}

export function getTrustedDevHosts() {
  const hosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const configuredHost = normalizeAddress(process.env.DEV_HOSTNAME?.trim() || "");
  const boundHost = normalizeAddress(process.env.HOST?.trim() || "");
  let interfaces = {};

  if (configuredHost) hosts.add(configuredHost);
  if (boundHost && boundHost !== "0.0.0.0" && boundHost !== "::") hosts.add(boundHost);

  try {
    interfaces = networkInterfaces();
  } catch {
    // Keep loopback and explicitly configured hosts when interface discovery is unavailable.
  }

  for (const entries of Object.values(interfaces)) {
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

// The Host header names the hostname the *browser* believes it is talking
// to. A DNS-rebinding page (attacker.example resolving to 127.0.0.1) reaches
// this server with Host: attacker.example, so anything not in the trusted
// dev-host set is rejected before a route runs.
export function isTrustedHostHeader(hostHeader) {
  if (!hostHeader || typeof hostHeader !== "string") return false;
  try {
    const { hostname } = new URL(`http://${hostHeader}`);
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
