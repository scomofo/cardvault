import { DECISION_SETTING_KEYS } from "./decisions/decisionSettings.js";

export const SETTING_KEY_ALIASES = {
  userName: "user_name",
  shipFrom: "ship_from",
  defaultPlatform: "default_platform",
  anthropicKey: "anthropic_key",
  autoBackup: "auto_backup",
};

export function normalizeSettingKey(key) {
  return SETTING_KEY_ALIASES[key] || key;
}

export function withLegacyAliases(settings) {
  const result = { ...settings };
  for (const [legacyKey, canonicalKey] of Object.entries(SETTING_KEY_ALIASES)) {
    if (result[legacyKey] == null && result[canonicalKey] != null) {
      result[legacyKey] = result[canonicalKey];
    }
  }
  return result;
}

// Keys the client is allowed to read back. Deliberately excludes anything
// credential-shaped (anthropic_api_key/anthropic_key, ebay_access_token,
// ebay_refresh_token, ebay_cert_id, ebay_oauth_state:*, listing_pre_sale_state:*, ...)
// so GET /api/settings can never leak secrets to an unauthenticated caller.
export const READABLE_SETTINGS_KEYS = new Set([
  "user_name","ship_from","default_platform",
  "currency","theme","notifications","auto_backup",
  "cv_service_autostart",
  ...DECISION_SETTING_KEYS,
]);

export const WRITABLE_SETTINGS_KEYS = new Set([
  "user_name","ship_from","default_platform",
  "currency","theme","notifications","anthropic_key","auto_backup",
  "cv_service_autostart",
  ...DECISION_SETTING_KEYS,
]);
