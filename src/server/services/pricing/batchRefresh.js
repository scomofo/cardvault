import { all } from "../../database.js";
import { refreshPricingForItem } from "./pricingService.js";

const DEFAULT_DELAY_MS = 300;
const DEFAULT_LIMIT = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Select items eligible for a batch pricing refresh: everything the user
 * still owns (not sold). Sorted by oldest snapshot first so repeated
 * batches naturally cover the cards that need a refresh most.
 */
function selectOwnedItems(limit) {
  return all(
    `SELECT ui.id
     FROM user_items ui
     LEFT JOIN (
       SELECT item_id, MAX(observed_at) AS latest_at
       FROM price_snapshots
       GROUP BY item_id
     ) ps ON ps.item_id = ui.id
     WHERE COALESCE(ui.sale_status, 'available') != 'sold'
       AND ui.sold_at IS NULL
     ORDER BY ps.latest_at IS NULL DESC, ps.latest_at ASC, ui.created_at ASC
     LIMIT ?`,
    [limit],
  );
}

/**
 * Refresh pricing for every owned item in the catalog by calling
 * `refreshPricingForItem` sequentially with a short delay between calls
 * to stay polite to the upstream data source (eBay Browse / SportsCardsPro).
 *
 * Sequential on purpose: parallel calls would risk rate-limit bans and
 * order-of-write issues on the shared snapshot table. A 500-card catalog
 * with a 300ms delay runs in about 2.5 minutes, which is acceptable as a
 * manual action.
 *
 * @param {{
 *   limit?: number,
 *   delayMs?: number,
 *   source?: string,
 *   refresh?: typeof refreshPricingForItem,
 *   listItems?: typeof selectOwnedItems,
 * }} [options]
 * @returns {Promise<{ total: number, refreshed: number, failed: number, durationMs: number, errors: Array<{ itemId: string, message: string }> }>}
 */
export async function refreshPricingForAllOwned({
  limit = DEFAULT_LIMIT,
  delayMs = DEFAULT_DELAY_MS,
  source,
  forceRefresh = false,
  refresh = refreshPricingForItem,
  listItems = selectOwnedItems,
} = {}) {
  const started = Date.now();
  const items = listItems(limit);
  const errors = [];
  let refreshed = 0;

  for (let i = 0; i < items.length; i += 1) {
    const { id } = items[i];
    try {
      await refresh(id, { source, forceRefresh });
      refreshed += 1;
    } catch (error) {
      errors.push({ itemId: id, message: error?.message || String(error) });
    }
    if (delayMs > 0 && i < items.length - 1) {
      await sleep(delayMs);
    }
  }

  return {
    total: items.length,
    refreshed,
    failed: errors.length,
    durationMs: Date.now() - started,
    errors,
  };
}
