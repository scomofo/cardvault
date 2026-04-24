import { all } from "../../database.js";

/**
 * Evaluate items for grading candidacy and ROI.
 * @param {{ itemId?: string|null }} [options]
 * @returns {object[]}
 */
export function runGradingAutomation({ itemId = null } = {}) {
  if (itemId != null && typeof itemId !== "string" && typeof itemId !== "number") {
    throw new Error("itemId must be a string or number");
  }

  let items;
  try {
    items = itemId
      ? all(`SELECT * FROM user_items WHERE id = ?`, [String(itemId)])
      : all(`SELECT * FROM user_items WHERE sale_status != 'sold'`);
  } catch (error) {
    console.error("Failed to fetch items for grading automation:", error);
    return [];
  }

  return items.map((item) => {
    const raw = Number(item.market_price || item.last_comp_price || 0) || 0;
    const psa9 = Number(item.psa9_price) || 0;
    const psa10 = Number(item.psa10_price) || 0;
    const projectedGrade = Number(item.projected_grade) || 8.5;
    const p10 = projectedGrade >= 9.5 ? 0.55 : projectedGrade >= 9 ? 0.25 : 0.1;
    const p9 = projectedGrade >= 9 ? 0.45 : 0.3;
    const pLow = Math.max(1 - p10 - p9, 0);
    const gradingCost = 25;
    const shipping = 8;
    const insurance = raw > 200 ? 5 : 0;
    const expectedGradedValue = psa10 * p10 + psa9 * p9 + raw * pLow;
    const roi = Number((expectedGradedValue - gradingCost - shipping - insurance - raw).toFixed(2));

    let recommendation = "sell_raw";
    if (roi > 40) recommendation = "grade";
    else if (roi > 5) recommendation = "maybe_grade";
    else if (projectedGrade < 8) recommendation = "manual_review";

    return {
      itemId: item.id,
      name: item.name,
      recommendation,
      estimatedRoi: roi,
      expectedGradedValue: Number(expectedGradedValue.toFixed(2)),
      recommendedGrader: raw > 250 ? "PSA" : "SGC",
      gradingPriorityScore: Math.round(Math.max(roi, 0) + raw / 5),
    };
  });
}
