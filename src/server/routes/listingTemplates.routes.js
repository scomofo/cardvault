import { all, get, run } from "../database.js";
import { toCamel, toCamelArray } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";
import { uid } from "./shared.js";

export function registerListingTemplatesRoutes(app) {
  app.get("/api/listing-templates", (req, res) => {
    try {
      const platform = req.query.platform;
      const rows = platform
        ? all("SELECT * FROM listing_templates WHERE platform = ? ORDER BY name", [platform])
        : all("SELECT * FROM listing_templates ORDER BY platform, name");
      res.json(toCamelArray(rows));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/listing-templates", requireJsonBody, (req, res) => {
    try {
      const { name, platform, titleFormat, descriptionTemplate, shippingDefault, formatDefault } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "name required" });
      if (!platform?.trim()) return res.status(400).json({ error: "platform required" });
      const id = uid();
      run(
        `INSERT INTO listing_templates
         (id, name, platform, title_format, description_template, shipping_default, format_default)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name.trim(),
          platform.trim(),
          titleFormat || "{name} {set} #{number} [{condition_short}]",
          descriptionTemplate || "",
          parseFloat(shippingDefault) || 4.99,
          formatDefault || "fixed",
        ],
      );
      res.status(201).json(toCamel(get("SELECT * FROM listing_templates WHERE id = ?", [id])));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/listing-templates/:id", requireJsonBody, (req, res) => {
    try {
      const existing = get("SELECT * FROM listing_templates WHERE id = ?", [req.params.id]);
      if (!existing) return res.status(404).json({ error: "Template not found" });
      const { name, platform, titleFormat, descriptionTemplate, shippingDefault, formatDefault } = req.body;
      run(
        `UPDATE listing_templates
         SET name=?, platform=?, title_format=?, description_template=?, shipping_default=?, format_default=?, updated_at=datetime('now')
         WHERE id=?`,
        [
          name?.trim() ?? existing.name,
          platform?.trim() ?? existing.platform,
          titleFormat ?? existing.title_format,
          descriptionTemplate ?? existing.description_template,
          parseFloat(shippingDefault) ?? existing.shipping_default,
          formatDefault ?? existing.format_default,
          req.params.id,
        ],
      );
      res.json(toCamel(get("SELECT * FROM listing_templates WHERE id = ?", [req.params.id])));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/listing-templates/:id", (req, res) => {
    try {
      const result = run("DELETE FROM listing_templates WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Template not found" });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
