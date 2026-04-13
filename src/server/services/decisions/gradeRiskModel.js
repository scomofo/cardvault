/**
 * Grade risk distribution model.
 *
 * Instead of assuming the projected grade is the realized grade, we compute
 * expected graded value across a 3-point distribution around the projection.
 * Weights come from observed PSA outcome variance — these are defensible
 * defaults, not calibrated values. Replace with an outcome-history model once
 * we have enough projected-vs-actual data.
 *
 *   projected - 0.5 → 0.25
 *   projected       → 0.50
 *   projected + 0.5 → 0.25
 *
 * The value at each grade point is interpolated between known PSA comps:
 *   grade 10  → psa10_price
 *   grade 9   → psa9_price
 *   grade < 9 → linear decay toward raw price
 */

const PSA10_ANCHOR = 10;
const PSA9_ANCHOR = 9;

/**
 * Value of the card at a hypothetical grade.
 * @param {number} grade
 * @param {{ raw: number, psa9: number, psa10: number }} comps
 */
function valueAtGrade(grade, comps) {
  const { raw, psa9, psa10 } = comps;
  if (grade >= PSA10_ANCHOR) return psa10 || psa9 || raw;
  if (grade >= PSA9_ANCHOR) {
    if (psa10 > 0 && psa9 > 0) {
      // Linear interpolate between PSA9 and PSA10 across 9.0 → 10.0
      const t = grade - PSA9_ANCHOR;
      return psa9 + (psa10 - psa9) * t;
    }
    return psa9 || raw;
  }
  // Below 9: decay toward raw value (grade 7 ≈ raw, grade 8 ≈ midpoint)
  if (psa9 > 0 && raw > 0) {
    const t = Math.max(0, (grade - 7) / 2); // 7→0, 9→1
    return raw + (psa9 - raw) * t;
  }
  return raw;
}

/**
 * Compute the expected graded value given a projected grade and comps.
 * @param {number} projectedGrade
 * @param {{ raw: number, psa9: number, psa10: number }} comps
 * @returns {{ expectedValue: number, distribution: Array<{grade: number, probability: number, value: number}> }}
 */
export function expectedGradedValue(projectedGrade, comps) {
  const points = [
    { grade: Math.max(1, projectedGrade - 0.5), probability: 0.25 },
    { grade: projectedGrade, probability: 0.5 },
    { grade: Math.min(10, projectedGrade + 0.5), probability: 0.25 },
  ];
  const distribution = points.map((point) => ({
    grade: point.grade,
    probability: point.probability,
    value: Number(valueAtGrade(point.grade, comps).toFixed(2)),
  }));
  const expectedValue = Number(
    distribution.reduce((sum, point) => sum + point.probability * point.value, 0).toFixed(2),
  );
  return { expectedValue, distribution };
}
