/** Estimated proceeds, not profit: acquisition cost and unmodelled charges are excluded. */
export function estimateSellingProceeds({ price, feeRate, shippingCost = 0, buyerShipping = 0, packagingCost = 0 }) {
  if (price == null || price === "" || !Number.isFinite(Number(price)) || Number(price) <= 0) return null;
  const amounts = [feeRate, shippingCost, buyerShipping, packagingCost].map(Number);
  if (amounts.some((value) => !Number.isFinite(value) || value < 0) || amounts[0] > 1) return null;
  const gross = Number(price) + amounts[2];
  return Math.round((gross - gross * amounts[0] - amounts[1] - amounts[3]) * 100) / 100;
}
