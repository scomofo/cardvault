import { all, get, run } from "../database.js";
import { requireJsonBody } from "../validation/common.js";
import { uid } from "./shared.js";

export function registerFeeModelsRoutes(app) {
  app.get("/api/fee-models", (_req, res) => {
    try {
      res.json(all("SELECT * FROM fee_models ORDER BY platform"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/fee-models/:platform", requireJsonBody, (req, res) => {
    try {
      const { platform } = req.params;
      if (!platform || typeof platform !== "string") {
        return res.status(400).json({ error: "platform required" });
      }
      const feeRate = parseFloat(req.body.fee_rate ?? req.body.feeRate);
      if (Number.isNaN(feeRate) || feeRate < 0 || feeRate > 1) {
        return res.status(400).json({ error: "fee_rate must be between 0 and 1" });
      }
      const existing = get("SELECT id FROM fee_models WHERE platform = ?", [platform]);
      if (existing) {
        run(
          "UPDATE fee_models SET fee_rate = ?, label = ?, updated_at = datetime('now') WHERE platform = ?",
          [feeRate, req.body.label ?? null, platform],
        );
      } else {
        run(
          "INSERT INTO fee_models (id, platform, fee_rate, label) VALUES (?, ?, ?, ?)",
          [uid(), platform, feeRate, req.body.label ?? null],
        );
      }
      res.json(get("SELECT * FROM fee_models WHERE platform = ?", [platform]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/fee-models/:platform", (req, res) => {
    try {
      const result = run("DELETE FROM fee_models WHERE platform = ?", [req.params.platform]);
      if (result.changes === 0) return res.status(404).json({ error: "Fee model not found" });
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
