import { all } from "../../database.js";

/**
 * Confidence calibration from historical decision feedback.
 *
 * For each decision type, computes the acceptance rate:
 *   accepted / (accepted + overridden + dismissed)
 *
 * Uses Laplace smoothing (+1 to numerator, +2 to denominator) so a single
 * sample doesn't swing the value to 0 or 1. Returns null when there's no
 * data, signalling the caller should fall back to the prior.
 */

const DEFAULT_MIN_SAMPLES = 5;

/**
 * @param {string} decisionType
 * @param {{ minSamples?: number }} [options]
 * @returns {{ confidence: number, sampleSize: number, accepted: number } | null}
 */
export function getCalibratedConfidence(decisionType, options = {}) {
  const minSamples = options.minSamples ?? DEFAULT_MIN_SAMPLES;
  let rows;
  try {
    rows = all(
      `SELECT d.recommendation, df.accepted, df.overridden, df.user_response
       FROM decisions d
       INNER JOIN decision_feedback df ON df.decision_id = d.id
       WHERE d.decision_type = ?`,
      [decisionType],
    );
  } catch {
    return null;
  }
  if (!rows || rows.length === 0) return null;

  let accepted = 0;
  let resolved = 0;
  for (const row of rows) {
    const wasAccepted = row.accepted === 1;
    const wasOverridden = row.overridden === 1;
    const wasDismissed = row.user_response === "dismissed";
    if (wasAccepted || wasOverridden || wasDismissed) {
      resolved += 1;
      if (wasAccepted) accepted += 1;
    }
  }

  if (resolved < minSamples) {
    return { confidence: null, sampleSize: resolved, accepted };
  }

  const smoothed = (accepted + 1) / (resolved + 2);
  return {
    confidence: Number(smoothed.toFixed(3)),
    sampleSize: resolved,
    accepted,
  };
}

/**
 * Blend a prior confidence with the calibrated value.
 * Returns the prior when there's no calibration signal yet.
 * @param {string} decisionType
 * @param {number} priorConfidence
 * @returns {{ confidence: number, priorConfidence: number, calibrated: boolean, sampleSize: number }}
 */
export function calibrateConfidence(decisionType, priorConfidence) {
  if (
    typeof priorConfidence !== "number" ||
    !Number.isFinite(priorConfidence) ||
    priorConfidence < 0 ||
    priorConfidence > 1
  ) {
    throw new RangeError("priorConfidence must be a finite number between 0 and 1");
  }

  const result = getCalibratedConfidence(decisionType);
  if (!result || result.confidence == null) {
    return {
      confidence: priorConfidence,
      priorConfidence,
      calibrated: false,
      sampleSize: result?.sampleSize ?? 0,
    };
  }
  return {
    confidence: result.confidence,
    priorConfidence,
    calibrated: true,
    sampleSize: result.sampleSize,
  };
}
