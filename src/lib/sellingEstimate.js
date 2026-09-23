/** Estimated proceeds, not profit: acquisition cost and unmodelled charges are excluded. */
export function estimateSellingProceeds({ price, feeRate, shippingCost = 0, buyerShipping = 0, packagingCost = 0 }) {
  if (price == null || price === "" || !Number.isFinite(Number(price)) || Number(price) <= 0) return null;
  const amounts = [feeRate, shippingCost, buyerShipping, packagingCost].map(Number);
  if (amounts.some((value) => !Number.isFinite(value) || value < 0) || amounts[0] > 1) return null;
  const gross = Number(price) + amounts[2];
  return Math.round((gross - gross * amounts[0] - amounts[1] - amounts[3]) * 100) / 100;
}

/** A draft preview that stays honest about the postage cost not yet being known. */
export function estimateDraftOutcome({ price, buyerShipping = 0, feeRate, costBasis = 0 }) {
  const proceedsBeforePostage = estimateSellingProceeds({ price, feeRate, buyerShipping });
  const acquisitionCost = Number(costBasis);
  if (proceedsBeforePostage === null || !Number.isFinite(acquisitionCost) || acquisitionCost < 0) return null;
  return {
    proceedsBeforePostage,
    profitBeforePostage: Math.round((proceedsBeforePostage - acquisitionCost) * 100) / 100,
    hasCostBasis: acquisitionCost > 0,
  };
}
