import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

function computeTrend(snapshot) {
  const average = Number(snapshot.average_price_cents || 0);
  const last = Number(snapshot.last_comp_price_cents || 0);
  if (!average) return 0;
  return (last - average) / average;
}

function alertForTrend(item, trend, sampleSize) {
  if (sampleSize < 2) return null;
  if (trend >= 0.2) return { type: "player_hot", severity: "high", action: "suggest_auction" };
  if (trend >= 0.1) return { type: "price_rising", severity: "medium", action: "suggest_hold" };
  if (trend <= -0.2) return { type: "market_crash", severity: "high", action: "suggest_sell_now" };
  if (trend <= -0.08) return { type: "price_dropping", severity: "medium", action: "suggest_price_drop" };
  return null;
}

/**
 * Analyze price snapshots to detect market trends and generate alerts.
 * @returns {object[]}
 */
export function runMarketTrendAutomation() {
  const snapshots = all(
    `SELECT ps.*, ui.id AS item_id, ui.name, ui.player_name, ui.card_set
     FROM price_snapshots ps
     JOIN user_items ui ON ui.id = ps.item_id
     WHERE ps.id IN (
       SELECT id FROM price_snapshots latest
       WHERE latest.item_id = ps.item_id
       ORDER BY observed_at DESC, created_at DESC
       LIMIT 1
     )`,
  );

  const alerts = [];
  for (const snapshot of snapshots) {
    const trend = computeTrend(snapshot);
    const rule = alertForTrend(snapshot, trend, Number(snapshot.sample_size || 0));
    if (!rule) continue;

    const existing = get(
      `SELECT * FROM market_alerts WHERE item_id = ? AND alert_type = ? AND status = 'open'`,
      [snapshot.item_id, rule.type],
    );
    if (!existing) {
      run(
        `INSERT INTO market_alerts
         (id, item_id, alert_type, severity, explanation, suggested_action, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?, 'open', datetime('now'), datetime('now'))`,
        [
          uid(),
          snapshot.item_id,
          rule.type,
          rule.severity,
          `${snapshot.player_name || snapshot.name} trend is ${(trend * 100).toFixed(1)}% on ${snapshot.sample_size} comps.`,
          rule.action,
        ],
      );
    }

    alerts.push({
      itemId: snapshot.item_id,
      name: snapshot.name,
      trend,
      sampleSize: snapshot.sample_size,
      alertType: rule.type,
      suggestedAction: rule.action,
    });
  }

  return alerts;
}
