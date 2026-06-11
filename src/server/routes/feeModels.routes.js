import { all, get, run } from "../database.js";
import { toCamel, toCamelArray } from "../mappers/recordMappers.js";
import { requireJsonBody } from "../validation/common.js";
import { uid } from "./shared.js";

const FEE_MODEL_FIELD_MAP = {
  fee_rate: "feeRate",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

function parseFeeRate(body) {
  return Number(body.feeRate ?? body.fee_rate);
}

function sendFeeModel(res, platform) {
  res.json(toCamel(get("SELECT * FROM fee_models WHERE platform = ?", [platform]), FEE_MODEL_FIELD_MAP));
}

export function registerFeeModelsRoutes(app) {
  app.get("/api/fee-models", (_req, res) => {
    try {
      res.json(toCamelArray(all("SELECT * FROM fee_models ORDER BY platform"), FEE_MODEL_FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/fee-models/:platform", requireJsonBody, (req, res) => {
    try {
      const platform = typeof req.params.platform === "string" ? req.params.platform.trim() : "";
      if (!platform) return res.status(400).json({ error: "platform required" });

      const feeRate = parseFeeRate(req.body);
      if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 1) {
        return res.status(400).json({ error: "feeRate must be between 0 and 1" });
      }

      const label = typeof req.body.label === "string" && req.body.label.trim()
        ? req.body.label.trim()
        : null;
      const existing = get("SELECT id FROM fee_models WHERE platform = ?", [platform]);
      if (existing) {
        run(
          "UPDATE fee_models SET fee_rate = ?, label = ?, updated_at = datetime('now') WHERE platform = ?",
          [feeRate, label, platform],
        );
      } else {
        run(
          "INSERT INTO fee_models (id, platform, fee_rate, label) VALUES (?, ?, ?, ?)",
          [uid(), platform, feeRate, label],
        );
      }

      sendFeeModel(res, platform);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/fee-models/:platform", (req, res) => {
    try {
      const result = run("DELETE FROM fee_models WHERE platform = ?", [req.params.platform]);
      if (result.changes === 0) return res.status(404).json({ error: "Fee model not found" });
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
