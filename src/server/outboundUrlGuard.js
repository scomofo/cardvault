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
 * loopback/private/link-local address is also rejected, and one that does
 * not resolve at all is rejected rather than handed to fetch. This is a
 * request-time check (not a connection-time guarantee — DNS can still
 * change between this call and the fetch itself), but it closes the common
 * cases without needing to proxy every request through a fixed resolver.
 */
export async function assertPublicOutboundUrl(rawUrl, label) {
  const endpoint = validateOutboundUrlSyntax(rawUrl, label);
  if (localAddressCheckDisabled()) return endpoint;

  let records;
  try {
    records = await lookup(endpoint.hostname, { all: true, verbatim: true });
  } catch (error) {
    // Fail closed: a hostname this process cannot resolve is not one it
    // should hand a partner token to. (Undici would fail the fetch anyway;
    // this just makes the reason explicit and keeps the guard total.)
    throw new Error(`${label} URL could not be resolved`, { cause: error });
  }
  if (records.some((record) => isTrustedLanAddressString(record.address))) {
    throw new Error(`${label} URL must not target a local or private address`);
  }

  return endpoint;
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const METHOD_REWRITING_REDIRECTS = new Set([301, 302, 303]);
// The only request headers that survive a redirect to a *different* origin.
// Everything else — Authorization, a partner's configured API-key header
// (whatever it is called), cookies — is a credential for the origin the
// caller validated, not for wherever that origin chose to send us.
const CROSS_ORIGIN_SAFE_HEADERS = new Set(["accept", "content-type", "user-agent"]);

function stripCredentialHeaders(headers) {
  const kept = {};
  for (const [name, value] of new Headers(headers || {})) {
    if (CROSS_ORIGIN_SAFE_HEADERS.has(name)) kept[name] = value;
  }
  return kept;
}

/**
 * fetch() that revalidates every redirect hop through assertPublicOutboundUrl
 * instead of letting fetch follow it automatically — a URL that passed the
 * check could still 307/308 the request into a private/link-local address
 * with the same method, body, and auth headers still attached, since a
 * plain `fetch(validatedUrl, ...)` follows redirects with no further checks.
 * A redirect to another origin also drops the request's credential headers
 * (see CROSS_ORIGIN_SAFE_HEADERS), the way browsers do.
 * `endpoint` must already be validated (e.g. via assertPublicOutboundUrl).
 */
export async function fetchPublic(endpoint, options, label) {
  let target = endpoint;
  let init = { ...options, redirect: "manual" };

  for (let hop = 0; ; hop++) {
    const response = await fetch(target, init);
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (hop >= MAX_REDIRECTS) {
      throw new Error(`${label} exceeded ${MAX_REDIRECTS} redirects`);
    }

    const next = await assertPublicOutboundUrl(new URL(location, target).href, label);
    if (next.origin !== target.origin) {
      init = { ...init, headers: stripCredentialHeaders(init.headers) };
    }
    target = next;
    if (METHOD_REWRITING_REDIRECTS.has(response.status) && init.method && !["GET", "HEAD"].includes(init.method)) {
      init = { ...init, method: "GET", body: undefined };
    }
  }
}
