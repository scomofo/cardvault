import { all, run } from "../database.js";
import { requireProtectedConfigWrite } from "../auth.js";
import { DECISION_SETTING_KEYS } from "../services/decisions/decisionSettings.js";
import { validateSettingsPayload } from "../validation/writeValidators.js";

const SETTING_KEY_ALIASES = {
  userName: "user_name",
  shipFrom: "ship_from",
  defaultPlatform: "default_platform",
  anthropicKey: "anthropic_key",
  autoBackup: "auto_backup",
};

function normalizeSettingKey(key) {
  return SETTING_KEY_ALIASES[key] || key;
}

function withLegacyAliases(settings) {
  const result = { ...settings };
  for (const [legacyKey, canonicalKey] of Object.entries(SETTING_KEY_ALIASES)) {
    if (result[legacyKey] == null && result[canonicalKey] != null) {
      result[legacyKey] = result[canonicalKey];
    }
  }
  return result;
}

export function registerSettingsRoutes(app) {
  app.get("/api/settings", (_req, res) => {
    try {
      const rows = all("SELECT * FROM settings");
      const settings = {};
      for (const row of rows) settings[row.key] = row.value;
      res.json(withLegacyAliases(settings));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings", requireProtectedConfigWrite, validateSettingsPayload, (req, res) => {
    try {
      const ALLOWED = new Set([
        "user_name","ship_from","default_platform",
        "currency","theme","notifications","anthropic_key","auto_backup",
        "cv_service_autostart",
        ...DECISION_SETTING_KEYS,
      ]);
      for (const [key, value] of Object.entries(req.body)) {
        const normalizedKey = normalizeSettingKey(key);
        if (!ALLOWED.has(normalizedKey)) continue;
        run(
          "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [normalizedKey, typeof value === "string" ? value : JSON.stringify(value)],
        );
      }
      res.json({ saved: true });
    } catch (error) {
      console.error("Failed to update settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
