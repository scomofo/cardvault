import { randomBytes } from "node:crypto";
import { all, get, run } from "../../database.js";

const SANDBOX = { auth: "https://auth.sandbox.ebay.com/oauth2/authorize", token: "https://api.sandbox.ebay.com/identity/v1/oauth2/token" };
const PROD = { auth: "https://auth.ebay.com/oauth2/authorize", token: "https://api.ebay.com/identity/v1/oauth2/token" };
const SCOPES = "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_PREFIX = "ebay_oauth_state:";
const pendingOauthStates = new Map();

function setting(key) { return get("SELECT value FROM settings WHERE key = ?", [key])?.value || null; }
function saveSetting(key, value) { run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]); }
function deleteSetting(key) { run("DELETE FROM settings WHERE key = ?", [key]); }
function getDefaultCallbackUrl() {
  return process.env.EBAY_CALLBACK_URL || process.env.EBAY_REDIRECT_URI || "http://localhost:3000/api/ebay/callback";
}

function getLegacyRuName() {
  const legacyValue = setting("ebay_redirect_uri") || process.env.EBAY_RU_NAME || "";
  if (!legacyValue || /^https?:\/\//i.test(legacyValue)) return "";
  return legacyValue;
}

function pruneExpiredOauthStates() {
  const now = Date.now();
  for (const [state, expiresAt] of pendingOauthStates.entries()) {
    if (expiresAt <= now) {
      pendingOauthStates.delete(state);
    }
  }

  for (const row of all("SELECT key, value FROM settings WHERE key LIKE ?", [`${OAUTH_STATE_PREFIX}%`])) {
    if (Number(row.value || 0) <= now) {
      deleteSetting(row.key);
    }
  }
}

export function issueOAuthState() {
  pruneExpiredOauthStates();
  const state = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
  pendingOauthStates.set(state, expiresAt);
  saveSetting(`${OAUTH_STATE_PREFIX}${state}`, String(expiresAt));
  return state;
}

export function consumeOAuthState(state) {
  pruneExpiredOauthStates();
  if (!state || typeof state !== "string") return false;
  const key = `${OAUTH_STATE_PREFIX}${state}`;
  const expiresAt = pendingOauthStates.get(state) ?? Number(setting(key) || 0);
  if (!expiresAt) return false;
  pendingOauthStates.delete(state);
  deleteSetting(key);
  return expiresAt > Date.now();
}

/**
 * Get eBay credentials from settings.
 * @returns {{ appId: string, certId: string, devId: string, sandbox: boolean, ruName: string, callbackUrl: string } | null}
 */
export function getEbayCredentials() {
  const appId = setting("ebay_app_id");
  const certId = setting("ebay_cert_id");
  const ruName = setting("ebay_ru_name") || getLegacyRuName();
  if (!appId || !certId || !ruName) return null;
  return {
    appId, certId,
    devId: setting("ebay_dev_id") || "",
    sandbox: setting("ebay_sandbox") !== "false",
    ruName,
    callbackUrl: setting("ebay_callback_url") || getDefaultCallbackUrl(),
  };
}

/**
 * Build the eBay OAuth authorization URL.
 * @param {{ state?: string }} [options]
 * @returns {string}
 */
export function getAuthUrl({ state } = {}) {
  const creds = getEbayCredentials();
  if (!creds) throw new Error("eBay credentials not configured");
  const base = creds.sandbox ? SANDBOX.auth : PROD.auth;
  const params = new URLSearchParams({
    client_id: creds.appId,
    redirect_uri: creds.ruName,
    response_type: "code",
    scope: SCOPES,
    ...(state ? { state } : {}),
  });
  return base + "?" + params.toString();
}

/**
 * Exchange authorization code for tokens.
 * @param {string} code
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: string }>}
 */
export async function exchangeCodeForToken(code) {
  const creds = getEbayCredentials();
  if (!creds) throw new Error("eBay credentials not configured");
  const url = creds.sandbox ? SANDBOX.token : PROD.token;
  const auth = Buffer.from(creds.appId + ":" + creds.certId).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: creds.ruName }),
  });
  if (!res.ok) throw new Error("Token exchange failed: " + (await res.text()));
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  saveSetting("ebay_access_token", data.access_token);
  saveSetting("ebay_refresh_token", data.refresh_token);
  saveSetting("ebay_token_expires", expiresAt);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt };
}

/**
 * Get a valid access token, refreshing if expired.
 * @returns {Promise<string>}
 */
export async function getAccessToken() {
  const token = setting("ebay_access_token");
  const expires = setting("ebay_token_expires");
  if (token && expires && new Date(expires) > new Date(Date.now() + 300000)) return token;
  const refresh = setting("ebay_refresh_token");
  if (!refresh) throw new Error("eBay not authorized - connect via Settings");
  const creds = getEbayCredentials();
  if (!creds) throw new Error("eBay credentials not configured");
  const url = creds.sandbox ? SANDBOX.token : PROD.token;
  const auth = Buffer.from(creds.appId + ":" + creds.certId).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, scope: SCOPES }),
  });
  if (!res.ok) throw new Error("Token refresh failed - re-authorize via Settings");
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  saveSetting("ebay_access_token", data.access_token);
  saveSetting("ebay_token_expires", expiresAt);
  return data.access_token;
}

/**
 * Check eBay connection status.
 * @returns {{ configured: boolean, connected: boolean, sandbox: boolean, expiresAt: string|null }}
 */
export function getEbayStatus() {
  const creds = getEbayCredentials();
  const token = setting("ebay_access_token");
  const expires = setting("ebay_token_expires");
  return {
    configured: !!creds,
    connected: !!token && !!expires && new Date(expires) > new Date(),
    sandbox: creds?.sandbox ?? true,
    expiresAt: expires,
  };
}
