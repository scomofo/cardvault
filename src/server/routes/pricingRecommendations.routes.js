import { all, get, run } from "../database.js";

export function registerPricingRecommendationsRoutes(app) {
  // GET /api/pricing-recommendations — latest recommendation per item per strategy
  // Joins user_items for name/set display. Optional ?strategy= filter.
  app.get("/api/pricing-recommendations", (req, res) => {
    try {
      const strategy = req.query.strategy || null;
      const strategyClause = strategy ? "AND pr.strategy = ?" : "";
      const params = strategy ? [strategy] : [];
      const rows = all(
        `SELECT pr.id, pr.item_id, pr.strategy, pr.recommended_price_cents,
                pr.minimum_acceptable_price_cents, pr.confidence, pr.explanation,
                pr.created_at,
                ui.name AS item_name, ui.set AS item_set, ui.condition,
                ui.suggested_listing_price, ui.market_price
         FROM pricing_recommendations pr
         JOIN user_items ui ON ui.id = pr.item_id
         WHERE pr.id IN (
           SELECT id FROM pricing_recommendations pr2
           WHERE pr2.item_id = pr.item_id AND pr2.strategy = pr.strategy
           ORDER BY pr2.created_at DESC LIMIT 1
         )
         ${strategyClause}
         ORDER BY pr.confidence DESC, pr.created_at DESC`,
        params,
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/pricing-recommendations/:id/apply — write recommended_price to user_items.suggested_listing_price
  app.post("/api/pricing-recommendations/:id/apply", (req, res) => {
    try {
      const rec = get("SELECT * FROM pricing_recommendations WHERE id = ?", [req.params.id]);
      if (!rec) return res.status(404).json({ error: "Recommendation not found" });
      const dollars = (rec.recommended_price_cents / 100).toFixed(2);
      run(
        `UPDATE user_items SET suggested_listing_price = ?, updated_at = datetime('now') WHERE id = ?`,
        [parseFloat(dollars), rec.item_id],
      );
      res.json({ ok: true, itemId: rec.item_id, price: parseFloat(dollars) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/pricing-recommendations/:id — dismiss a specific recommendation
  app.delete("/api/pricing-recommendations/:id", (req, res) => {
    try {
      const rec = get("SELECT id FROM pricing_recommendations WHERE id = ?", [req.params.id]);
      if (!rec) return res.status(404).json({ error: "Recommendation not found" });
      run("DELETE FROM pricing_recommendations WHERE id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
