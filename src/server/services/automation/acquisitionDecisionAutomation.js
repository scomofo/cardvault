import { get } from "../../database.js";

/**
 * Evaluate whether a potential card acquisition is worth buying.
 * @param {object} [input]
 * @returns {{ recommendation: string, confidence: number, explanation: string }}
 */
export function runAcquisitionDecisionAutomation(input = {}) {
  const askingPrice = Number(input.askingPrice || input.asking_price || 0);
  const estimatedExitSource = input.estimatedExitValue ?? input.estimated_exit_value ?? 0;
  const estimatedExitValue = Number(estimatedExitSource);
  const gradingUpside = Number(input.estimatedGradingUpside || input.estimated_grading_upside || 0);
  const sourceRoi = Number(input.historicalRoiBySource || input.historical_roi_by_source || 0);
  const sealedResale = Number(input.sealedResaleValue || input.sealed_resale_value || 0);
  const breakValue = Number(input.breakExpectedValue || input.break_expected_value || 0);
  const totalExpected = estimatedExitValue + gradingUpside;

  let recommendation = "pass";
  if (sealedResale > 0 || breakValue > 0) {
    recommendation = breakValue > sealedResale ? "rip_sealed" : "keep_sealed";
  } else if (totalExpected >= askingPrice * 1.25) {
    recommendation = "buy_now";
  } else if (totalExpected >= askingPrice * 1.05) {
    recommendation = "buy_if_price_drops";
  }

  if (sourceRoi < 0) {
    recommendation = "manual_review";
  }

  return {
    recommendation,
    maxBuyPrice: Number((totalExpected * 0.8).toFixed(2)),
    expectedSpread: Number((totalExpected - askingPrice).toFixed(2)),
    sourceWarning: sourceRoi < 0 ? "Source has historically poor ROI." : null,
    ripVsKeep: sealedResale > 0 || breakValue > 0 ? recommendation : null,
  };
}
