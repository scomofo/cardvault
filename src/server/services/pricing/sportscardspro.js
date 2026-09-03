import { normalizePricingPayload } from "./pricingMapper.js";

const LOOKUP_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = LOOKUP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("SportsCardsPro lookup timed out", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildSimulatedSnapshot(item) {
  const seedText = [
    item.name,
    item.card_set,
    item.year,
    item.card_number,
    item.parallel,
  ]
    .filter(Boolean)
    .join("|");

  const seed = Array.from(seedText).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const baseDollars =
    Number(item.market_price || item.suggested_listing_price || item.cost_basis || 0) ||
    ((seed % 3500) / 100) + 5;
  const volatility = ((seed % 9) + 1) / 100;

  const marketPriceCents = Math.round(baseDollars * 100);
  const averagePriceCents = Math.round(marketPriceCents * (1 - volatility / 2));
  const lastCompPriceCents = Math.round(marketPriceCents * (1 + volatility / 3));
  const lowPriceCents = Math.round(marketPriceCents * (1 - volatility * 2));
  const highPriceCents = Math.round(marketPriceCents * (1 + volatility * 3));

  return normalizePricingPayload({
    source: "sportscardspro-simulated",
    catalogCardId: item.parallel_id || item.id,
    observedAt: new Date().toISOString(),
    conditionBucket: "raw",
    marketPriceCents,
    averagePriceCents,
    lowPriceCents,
    highPriceCents,
    lastCompPriceCents,
    sampleSize: 5 + (seed % 8),
    comps: Array.from({ length: 3 }, (_, index) => ({
      compDate: new Date(Date.now() - index * 86400000).toISOString(),
      compPriceCents: Math.round(lastCompPriceCents * (1 + ((index - 1) * volatility) / 4)),
      title: `${item.year || ""} ${item.card_set || ""} ${item.name || ""}`.trim(),
      url: null,
      grade: null,
      conditionBucket: "raw",
    })),
    rawPayload: { simulated: true, seed },
  });
}

/**
 * Fetch pricing data from SportsCardsPro API.
 * @param {object} itemOrLookup
 * @returns {Promise<object>}
 */
export async function fetchSportsCardsProPrice(itemOrLookup) {
  const apiBase = process.env.SPORTSCARDSPRO_API_BASE;
  const apiKey = process.env.SPORTSCARDSPRO_API_KEY;

  if (!apiBase || !apiKey) {
    return buildSimulatedSnapshot(itemOrLookup);
  }

  const response = await fetchWithTimeout(`${apiBase.replace(/\/$/, "")}/pricing/lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: itemOrLookup.name,
      year: itemOrLookup.year,
      set: itemOrLookup.card_set || itemOrLookup.set,
      cardNumber: itemOrLookup.card_number || itemOrLookup.number,
      player: itemOrLookup.player_name,
      parallel: itemOrLookup.parallel,
    }),
  });

  if (!response.ok) {
    throw new Error(`SportsCardsPro lookup failed (${response.status})`);
  }

  const payload = await response.json();
  return normalizePricingPayload({
    source: "sportscardspro",
    catalogCardId: payload.catalogCardId || payload.cardId || null,
    observedAt: payload.observedAt || new Date().toISOString(),
    conditionBucket: payload.conditionBucket || "raw",
    marketPriceCents: payload.marketPriceCents ?? payload.market_price_cents ?? 0,
    averagePriceCents: payload.averagePriceCents ?? payload.average_price_cents ?? 0,
    lowPriceCents: payload.lowPriceCents ?? payload.low_price_cents ?? 0,
    highPriceCents: payload.highPriceCents ?? payload.high_price_cents ?? 0,
    lastCompPriceCents: payload.lastCompPriceCents ?? payload.last_comp_price_cents ?? 0,
    sampleSize: payload.sampleSize ?? payload.sample_size ?? 0,
    comps: payload.comps || [],
    rawPayload: payload,
  });
}
