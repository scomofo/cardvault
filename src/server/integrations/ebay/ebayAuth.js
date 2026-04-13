import { get, run } from "../../database.js";

const SANDBOX = { auth: "https://auth.sandbox.ebay.com/oauth2/authorize", token: "https://api.sandbox.ebay.com/identity/v1/oauth2/token" };
const PROD = { auth: "https://auth.ebay.com/oauth2/authorize", token: "https://api.ebay.com/identity/v1/oauth2/token" };
const SCOPES = "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment";

function setting(key) { return get("SELECT value FROM settings WHERE key = ?", [key])?.value || null; }
function saveSetting(key, value) { run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]); }

/**
 * Get eBay credentials from settings.
 * @returns {{ appId: string, certId: string, devId: string, sandbox: boolean, redirectUri: string } | null}
 */
export function getEbayCredentials() {
  const appId = setting("ebay_app_id");
  const certId = setting("ebay_cert_id");
  if (!appId || !certId) return null;
  return {
    appId, certId,
    devId: setting("ebay_dev_id") || "",
    sandbox: setting("ebay_sandbox") !== "false",
    redirectUri: setting("ebay_redirect_uri") || "http://localhost:3000/api/ebay/callback",
  };
}

/**
 * Build the eBay OAuth authorization URL.
 * @returns {string}
 */
export function getAuthUrl() {
  const creds = getEbayCredentials();
  if (!creds) throw new Error("eBay credentials not configured");
  const base = creds.sandbox ? SANDBOX.auth : PROD.auth;
  const params = new URLSearchParams({ client_id: creds.appId, redirect_uri: creds.redirectUri, response_type: "code", scope: SCOPES });
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
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: creds.redirectUri }),
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
