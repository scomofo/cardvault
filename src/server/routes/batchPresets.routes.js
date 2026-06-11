import { all, get, run } from "../database.js";
import { requireJsonBody, isObject } from "../validation/common.js";
import { uid } from "./shared.js";

function parseDefaults(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toPreset(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    defaults: parseDefaults(row.defaults_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateDefaults(defaults) {
  if (defaults == null) return null;
  return isObject(defaults) ? null : "defaults must be an object";
}

export function registerBatchPresetsRoutes(app) {
  app.get("/api/batch-presets", (_req, res) => {
    try {
      res.json(all("SELECT * FROM batch_presets ORDER BY created_at DESC").map(toPreset));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/batch-presets", requireJsonBody, (req, res) => {
    try {
      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(400).json({ error: "name required" });

      const defaultsError = validateDefaults(req.body.defaults);
      if (defaultsError) return res.status(400).json({ error: defaultsError });

      const id = uid();
      run(
        "INSERT INTO batch_presets (id, name, defaults_json) VALUES (?, ?, ?)",
        [id, name, JSON.stringify(req.body.defaults || {})],
      );
      res.status(201).json(toPreset(get("SELECT * FROM batch_presets WHERE id = ?", [id])));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/batch-presets/:id", requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT * FROM batch_presets WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Preset not found" });

      const defaultsError = validateDefaults(req.body.defaults);
      if (defaultsError) return res.status(400).json({ error: defaultsError });

      const name = typeof req.body.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : existing.name;
      const defaults = req.body.defaults ?? parseDefaults(existing.defaults_json);
      run(
        "UPDATE batch_presets SET name = ?, defaults_json = ?, updated_at = datetime('now') WHERE id = ?",
        [name, JSON.stringify(defaults), req.params.id],
      );
      res.json(toPreset(get("SELECT * FROM batch_presets WHERE id = ?", [req.params.id])));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/batch-presets/:id", (req, res) => {
    try {
      const result = run("DELETE FROM batch_presets WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Preset not found" });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
