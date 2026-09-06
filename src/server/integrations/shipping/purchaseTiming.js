// Keep carrier calls shorter than the durable purchasing claim.
export const SHIPPING_CLAIM_TTL_MS = 120_000;
export const MAX_LABEL_PURCHASE_TIMEOUT_MS = 60_000;
export function labelPurchaseTimeoutMs(metadata = {}, rate = {}) {
  const configured = [rate.labelPurchaseTimeoutMs, rate.label_purchase_timeout_ms,
    metadata.labelPurchaseTimeoutMs, metadata.label_purchase_timeout_ms]
    .find((value) => value != null && value !== "");
  const timeout = Number(configured);
  return Number.isFinite(timeout) && timeout > 0
    ? Math.min(timeout, MAX_LABEL_PURCHASE_TIMEOUT_MS) : 10_000;
}
