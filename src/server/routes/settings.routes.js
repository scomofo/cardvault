import { all, run } from "../database.js";
import { requireProtectedConfigWrite } from "../auth.js";
import { validateSettingsPayload } from "../validation/writeValidators.js";
import {
  normalizeSettingKey,
  withLegacyAliases,
  READABLE_SETTINGS_KEYS,
  WRITABLE_SETTINGS_KEYS,
} from "../services/settingsKeys.js";

export function registerSettingsRoutes(app) {
  app.get("/api/settings", (_req, res) => {
    try {
      const rows = all("SELECT * FROM settings");
      const settings = {};
      for (const row of rows) {
        if (READABLE_SETTINGS_KEYS.has(row.key)) settings[row.key] = row.value;
      }
      res.json(withLegacyAliases(settings));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings", requireProtectedConfigWrite, validateSettingsPayload, (req, res) => {
    try {
      for (const [key, value] of Object.entries(req.body)) {
        const normalizedKey = normalizeSettingKey(key);
        if (!WRITABLE_SETTINGS_KEYS.has(normalizedKey)) continue;
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
