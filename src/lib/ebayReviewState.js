const ENVIRONMENTS = new Set(["sandbox", "production"]);

export function freshEbayCheck(check, environment, now = Date.now()) {
  return Boolean(check?.ready === true && check.id && ENVIRONMENTS.has(environment)
    && check.environment === environment && Number.isFinite(Date.parse(check.expiresAt))
    && Date.parse(check.expiresAt) > now);
}

export function checkedEbayPublishRequest({ check, environment, confirmed, now = Date.now(), listingId }) {
  if (!confirmed || !freshEbayCheck(check, environment, now)) {
    throw new Error("Run a fresh eBay check and confirm its details before publishing.");
  }
  return { listingId, marketplace: "ebay", checkId: check.id, confirmChecked: true, environment };
}

export function sellingSetupComplete(config) {
  return ["fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId", "postalCode", "sport", "manufacturer"]
    .every((key) => typeof config?.[key] === "string" && config[key].trim().length > 0);
}

export function formatCheckedAmount(amount, currency = "CAD") {
  if (amount === null || amount === undefined || amount === "" || !Number.isFinite(Number(amount))) return "Not supplied";
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(amount)); }
  catch { return `${amount} ${currency}`; }
}
