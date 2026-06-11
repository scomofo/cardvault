import { all, get, run } from "../database.js";
import { toCamelArray } from "../mappers/recordMappers.js";

const FIELD_MAP = {
  item_id: "itemId",
  recommended_price_cents: "recommendedPriceCents",
  minimum_acceptable_price_cents: "minimumAcceptablePriceCents",
  created_at: "createdAt",
  item_name: "itemName",
  item_set: "itemSet",
  suggested_listing_price: "suggestedListingPrice",
  market_price: "marketPrice",
};

export function registerPricingRecommendationsRoutes(app) {
  app.get("/api/pricing-recommendations", (req, res) => {
    try {
      const strategy = typeof req.query.strategy === "string" ? req.query.strategy : null;
      const strategyClause = strategy ? "AND pr.strategy = ?" : "";
      const params = strategy ? [strategy] : [];
      const rows = all(
        `SELECT pr.id, pr.item_id, pr.strategy, pr.recommended_price_cents,
                pr.minimum_acceptable_price_cents, pr.confidence, pr.explanation,
                pr.created_at,
                ui.name AS item_name, ui.card_set AS item_set, ui.condition,
                ui.suggested_listing_price, ui.market_price
         FROM pricing_recommendations pr
         JOIN user_items ui ON ui.id = pr.item_id
         WHERE pr.id IN (
           SELECT pr2.id FROM pricing_recommendations pr2
           WHERE pr2.item_id = pr.item_id AND pr2.strategy = pr.strategy
           ORDER BY pr2.created_at DESC, pr2.id DESC LIMIT 1
         )
         ${strategyClause}
         ORDER BY
           CASE pr.confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
           pr.created_at DESC`,
        params,
      );
      res.json(toCamelArray(rows, FIELD_MAP));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pricing-recommendations/:id/apply", (req, res) => {
    try {
      const recommendation = get("SELECT * FROM pricing_recommendations WHERE id = ?", [req.params.id]);
      if (!recommendation) return res.status(404).json({ error: "Recommendation not found" });

      const price = Number((recommendation.recommended_price_cents / 100).toFixed(2));
      run(
        "UPDATE user_items SET suggested_listing_price = ?, updated_at = datetime('now') WHERE id = ?",
        [price, recommendation.item_id],
      );
      res.json({ ok: true, itemId: recommendation.item_id, price });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/pricing-recommendations/:id", (req, res) => {
    try {
      const result = run("DELETE FROM pricing_recommendations WHERE id = ?", [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: "Recommendation not found" });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
