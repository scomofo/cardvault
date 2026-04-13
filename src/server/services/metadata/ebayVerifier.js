import { searchBrowse } from "../../integrations/ebay/ebayBrowse.js";

const DEFAULT_MIN_HITS = 3;
const BOOST = 0.07;
const PENALTY = -0.12;

function buildQuery(card) {
  const parts = [
    card?.year,
    card?.set_name || card?.set,
    card?.player_name || card?.name,
    card?.card_number ? `#${card.card_number}` : null,
    card?.parallel_name || card?.parallel || null,
  ]
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean);
  return parts.join(" ");
}

function summarizeResults(results) {
  if (!results || !Array.isArray(results.items)) return null;
  const top = results.items[0] || null;
  return {
    hits: Number(results.total || results.items.length || 0),
    sampleTitle: top?.title || null,
    samplePrice: top?.price ?? null,
    sampleCurrency: top?.currency || null,
    sampleUrl: top?.url || null,
  };
}

function scoreAdjustment(hits, minHits) {
  if (hits === 0) return PENALTY;
  if (hits >= minHits) return BOOST;
  return 0;
}

/**
 * Verify a candidate card by querying eBay Browse and returning a score
 * adjustment plus a summary of the top listing for downstream display.
 *
 * Failures (missing creds, network, timeout) resolve to `null` so callers
 * can treat the verifier as best-effort rather than load-bearing.
 *
 * @param {object} card normalized candidate.card shape
 * @param {{ minHits?: number, search?: typeof searchBrowse }} [options]
 * @returns {Promise<null | { hits: number, adjustment: number, query: string, sampleTitle: string|null, samplePrice: number|null, sampleCurrency: string|null, sampleUrl: string|null }>}
 */
export async function verifyCandidateAgainstEbay(card, { minHits = DEFAULT_MIN_HITS, search = searchBrowse } = {}) {
  const query = buildQuery(card);
  if (!query) return null;

  let results;
  try {
    results = await search(query, { limit: 5 });
  } catch {
    return null;
  }
  const summary = summarizeResults(results);
  if (!summary) return null;

  return {
    query,
    hits: summary.hits,
    adjustment: scoreAdjustment(summary.hits, minHits),
    sampleTitle: summary.sampleTitle,
    samplePrice: summary.samplePrice,
    sampleCurrency: summary.sampleCurrency,
    sampleUrl: summary.sampleUrl,
  };
}

export function isEbayVerifierEnabled() {
  return process.env.EBAY_VERIFIER_ENABLED !== "false";
}
