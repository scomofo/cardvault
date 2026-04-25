import { all, get, run } from "../database.js";
import { requireJsonBody } from "../validation/common.js";
import { uid } from "./shared.js";

export function registerBatchPresetsRoutes(app) {
  app.get("/api/batch-presets", (_req, res) => {
    try {
      const rows = all("SELECT * FROM batch_presets ORDER BY created_at DESC");
      res.json(rows.map((r) => ({ ...r, defaults: JSON.parse(r.defaults_json || "{}") })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/batch-presets", requireJsonBody, (req, res) => {
    try {
      const { name, defaults } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name required" });
      }
      const id = uid();
      run(
        "INSERT INTO batch_presets (id, name, defaults_json) VALUES (?, ?, ?)",
        [id, name.trim(), JSON.stringify(defaults || {})],
      );
      const row = get("SELECT * FROM batch_presets WHERE id = ?", [id]);
      res.status(201).json({ ...row, defaults: JSON.parse(row.defaults_json || "{}") });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/batch-presets/:id", requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT * FROM batch_presets WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Preset not found" });
      const { name, defaults } = req.body;
      run(
        "UPDATE batch_presets SET name = ?, defaults_json = ?, updated_at = datetime('now') WHERE id = ?",
        [
          (name ?? existing.name).trim(),
          JSON.stringify(defaults ?? JSON.parse(existing.defaults_json || "{}")),
          req.params.id,
        ],
      );
      const row = get("SELECT * FROM batch_presets WHERE id = ?", [req.params.id]);
      res.json({ ...row, defaults: JSON.parse(row.defaults_json || "{}") });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/batch-presets/:id", (req, res) => {
    try {
      const result = run("DELETE FROM batch_presets WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Preset not found" });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
