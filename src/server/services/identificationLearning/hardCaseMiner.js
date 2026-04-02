import { all, get, run } from "../../database.js";
import { uid } from "../../routes/shared.js";

export function mineHardCases() {
  const failures = all(
    `SELECT
       ir.recommendation,
       cc.set_name,
       cc.parallel_name,
       COUNT(*) AS failure_count
     FROM identification_results ir
     LEFT JOIN catalog_cards cc ON cc.id = ir.final_catalog_card_id
     WHERE ir.recommendation IN ('needs_manual_review', 'requires_back_scan', 'unresolved')
     GROUP BY ir.recommendation, cc.set_name, cc.parallel_name
     ORDER BY failure_count DESC`,
  );

  const clusters = [];
  for (const failure of failures) {
    const key = [failure.recommendation, failure.set_name || "unknown", failure.parallel_name || "base"].join("|");
    const existing = get(`SELECT * FROM hard_case_clusters WHERE cluster_key = ?`, [key]);
    if (existing) {
      run(
        `UPDATE hard_case_clusters
         SET failure_count = ?, example_json = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [failure.failure_count, JSON.stringify(failure), existing.id],
      );
      clusters.push(get(`SELECT * FROM hard_case_clusters WHERE id = ?`, [existing.id]));
    } else {
      const id = uid();
      run(
        `INSERT INTO hard_case_clusters (id, cluster_key, failure_count, example_json, created_at, updated_at)
         VALUES (?,?,?,?,datetime('now'),datetime('now'))`,
        [id, key, failure.failure_count, JSON.stringify(failure)],
      );
      clusters.push(get(`SELECT * FROM hard_case_clusters WHERE id = ?`, [id]));
    }
  }

  return clusters;
}
