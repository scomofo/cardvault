import { all, run } from "../database.js";
import { DECISION_SETTING_KEYS } from "../services/decisions/decisionSettings.js";
import { validateSettingsPayload } from "../validation/writeValidators.js";

export function registerSettingsRoutes(app) {
  app.get("/api/settings", (_req, res) => {
    try {
      const rows = all("SELECT * FROM settings");
      const settings = {};
      for (const row of rows) settings[row.key] = row.value;
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings", validateSettingsPayload, (req, res) => {
    try {
      const ALLOWED = new Set([
        "userName","user_name","shipFrom","ship_from","defaultPlatform","default_platform",
        "currency","theme","notifications","anthropicKey","anthropic_key","autoBackup","auto_backup",
        ...DECISION_SETTING_KEYS,
      ]);
      for (const [key, value] of Object.entries(req.body)) {
        if (!ALLOWED.has(key)) continue;
        run(
          "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [key, typeof value === "string" ? value : JSON.stringify(value)],
        );
      }
      res.json({ saved: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
