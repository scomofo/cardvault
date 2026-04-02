function clampCents(value) {
  const cents = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(cents, 0);
}

export function dollarsToCents(value) {
  return clampCents(Number(value || 0) * 100);
}

export function centsToDollars(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

export function normalizePricingPayload(input = {}) {
  return {
    source: input.source || "sportscardspro",
    catalogCardId: input.catalogCardId || null,
    observedAt: input.observedAt || new Date().toISOString(),
    conditionBucket: input.conditionBucket || "raw",
    marketPriceCents: clampCents(input.marketPriceCents),
    averagePriceCents: clampCents(input.averagePriceCents),
    lowPriceCents: clampCents(input.lowPriceCents),
    highPriceCents: clampCents(input.highPriceCents),
    lastCompPriceCents: clampCents(input.lastCompPriceCents),
    sampleSize: Math.max(Number(input.sampleSize || 0), 0),
    comps: Array.isArray(input.comps) ? input.comps : [],
    rawPayload: input.rawPayload || null,
  };
}

export function recommendationFromSnapshot(snapshot) {
  const last = snapshot.lastCompPriceCents || snapshot.marketPriceCents || 0;
  const average = snapshot.averagePriceCents || last;
  const high = snapshot.highPriceCents || average;
  const quickSale = Math.round(last * 0.9);
  const market = last;
  const premium = Math.round((average * 0.7) + (high * 0.3));

  return {
    quick_sale: quickSale,
    market,
    premium: premium || market,
    min_acceptable_price_cents: Math.round(last * 0.82),
  };
}
