import { all, run } from "../database.js";
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
      for (const [key, value] of Object.entries(req.body)) {
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
