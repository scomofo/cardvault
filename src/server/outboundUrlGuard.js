import { lookup } from "node:dns/promises";
import { isTrustedLanAddressString, normalizeAddress } from "./networkTrust.js";

// Marketplace handoff and shipping-label URLs are user-configured (via
// connection metadata) and fetched server-side with the connection's
// access token attached — a URL pointed at loopback/private/link-local
// (e.g. cloud metadata at 169.254.169.254) would probe internal services
// and hand them that token. These guards reject that class of target.

function isObviouslyLocalHostname(hostname) {
  const host = normalizeAddress(hostname);
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local");
}

// Test-only escape hatch: integration tests stand up a real HTTP server on
// 127.0.0.1 to play the part of a marketplace/shipping partner, which the
// local-address check below would otherwise (correctly, for real usage)
// reject. Never set in production — it isn't documented in .env.example and
// nothing but the test harness sets it (see tests/helpers/testServer.js).
function localAddressCheckDisabled() {
  return process.env.CARDVAULT_ALLOW_LOCAL_OUTBOUND_URLS === "1";
}

/**
 * Synchronous checks only: well-formed URL, http/https scheme, and not an
 * IP-literal or obviously-local hostname. Suitable for validating input at
 * write time (e.g. when a connection's metadata is saved). Does not resolve
 * DNS, so a hostname that only *resolves* to a local address is not caught
 * here — use assertPublicOutboundUrl for that before actually fetching.
 */
export function validateOutboundUrlSyntax(rawUrl, label) {
  let endpoint;
  try {
    endpoint = new URL(rawUrl);
  } catch {
    throw new Error(`${label} URL is invalid`);
  }

  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new Error(`${label} URL must use http or https`);
  }

  if (
    !localAddressCheckDisabled() &&
    (isObviouslyLocalHostname(endpoint.hostname) || isTrustedLanAddressString(endpoint.hostname))
  ) {
    throw new Error(`${label} URL must not target a local or private address`);
  }

  return endpoint;
}

/**
 * Full check before an actual outbound fetch: the syntax/host-literal check
 * above, plus a DNS lookup so a hostname that currently resolves to a
 * loopback/private/link-local address is also rejected. This is a
 * best-effort, request-time check (not a connection-time guarantee — DNS
 * can still change between this call and the fetch itself), but it closes
 * the common cases without needing to proxy every request through a fixed
 * resolver.
 */
export async function assertPublicOutboundUrl(rawUrl, label) {
  const endpoint = validateOutboundUrlSyntax(rawUrl, label);
  if (localAddressCheckDisabled()) return endpoint;

  try {
    const records = await lookup(endpoint.hostname, { all: true, verbatim: true });
    if (records.some((record) => isTrustedLanAddressString(record.address))) {
      throw new Error(`${label} URL must not target a local or private address`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("must not target")) throw error;
    // Lookup failures (offline dev environment, transient DNS issue) are
    // surfaced by the fetch itself; don't block the request on those here.
  }

  return endpoint;
}
