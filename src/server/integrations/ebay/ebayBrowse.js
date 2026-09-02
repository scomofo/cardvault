import { getAccessToken, getEbayCredentials } from "./ebayAuth.js";

const SANDBOX_BROWSE = "https://api.sandbox.ebay.com/buy/browse/v1";
const PROD_BROWSE = "https://api.ebay.com/buy/browse/v1";

/**
 * Search eBay's Browse API for item summaries.
 *
 * `fetcher` is injectable for tests. In production it defaults to the global
 * fetch so the live call reuses the user's OAuth token.
 *
 * @param {string} query free-text search query
 * @param {{ limit?: number, fetcher?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ total: number, items: Array<{ title: string, price: number|null, currency: string|null, url: string|null }> }>}
 */
export async function searchBrowse(query, { limit = 10, fetcher = fetch, timeoutMs = 2000 } = {}) {
  if (!query || !query.trim()) return { total: 0, items: [] };

  const creds = getEbayCredentials();
  if (!creds) throw new Error("eBay credentials not configured");
  const token = await getAccessToken();

  const base = creds.sandbox ? SANDBOX_BROWSE : PROD_BROWSE;
  const url = `${base}/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_CA", // matches the CAD currency the app assumes everywhere else
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`eBay Browse error ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
    return {
      total: Number(data.total || items.length || 0),
      items: items.map((item) => ({
        title: String(item.title || ""),
        price: item.price?.value ? Number(item.price.value) : null,
        currency: item.price?.currency || null,
        url: item.itemWebUrl || null,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}
