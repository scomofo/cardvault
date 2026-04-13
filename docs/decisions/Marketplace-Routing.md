# Marketplace Routing

Documents the decision logic in `src/server/services/decisions/marketplaceDecision.js`. This is a spec for existing code.

## Purpose

For each item ready to sell, pick the channel that maximizes net proceeds given value tier, age, storage location, and selling-strategy context.

## Inputs

| Field | Source |
|---|---|
| `item.market_price` | pricing decision |
| `ageDays` | derived from `item.acquired_at` |
| `item.listing_status` | `items.listing_status` |
| `item.storage_location` | `items.storage_location` (free text) |
| `strategyDecision.recommendation` | from `sellingStrategyDecision` |

## Algorithm (priority order)

```
if marketPrice > marketplace_consignment_threshold       → consign_high_end
elif strategy == bundle_with_similar
     or marketPrice < marketplace_low_value_floor        → keep_local_only
elif ageDays > marketplace_stale_days_comc               → send_to_comc
elif listing_status == listed
     and ageDays > marketplace_stale_days_crosspost      → crosspost
elif storage_location contains "store"                   → store_inventory_shopify
elif strategy == auction_recommended                     → sell_on_ebay
else                                                     → sell_on_ebay (default)
```

All thresholds live in `services/decisions/decisionSettings.js`. Defaults:
`marketplace_consignment_threshold=500`, `marketplace_low_value_floor=10`,
`marketplace_stale_days_comc=120`, `marketplace_stale_days_crosspost=60`.

## Outputs

| Recommendation | Action | Marketplace tag |
|---|---|---|
| `sell_on_ebay` | `assign_marketplace` | `ebay` |
| `consign_high_end` | `route_to_consignment` | — |
| `send_to_comc` | `assign_marketplace` | `comc` |
| `store_inventory_shopify` | `assign_marketplace` | `shopify` |
| `crosspost` | `create_crosspost_plan` | — |
| `keep_local_only` | `assign_marketplace` | — |

Confidence: constant `0.65`.

The decision emits `expectedNet` (for the chosen channel), `channelNets`
(map of every eligible channel to its expected net), and `bestChannel` (the
highest-net option). The rule tree still picks the channel, but operators
can see the gap. Current default fee rates used by `computeExpectedNet`:

| Marketplace | Rate | Flat fee |
|---|---|---|
| eBay | 13.35% | $0.40 |
| TCGplayer | 10.25% | $0 |
| Mercari | 10% | $0 |
| Shopify (payments) | 2.9% | $0.30 |
| COMC | 20% | $0 |
| Consignment | 20% | $0 |
| Local cash | 0% | $0 |

The full `channelNets` map and `bestChannel` pointer are now exposed in
`inputsUsed`, and the explanation highlights when the rule-picked channel
differs from the highest-net option. The next step is to upgrade the tree
itself to select channels by maximizing expected net subject to the existing
constraints (consignment threshold, age rules).

## Interactions

- **Upstream**: `sellingStrategyDecision` (read via `context.strategyDecision`). Must run after strategy in `decisionEngine.js`.
- **Downstream**: `listingGenerationAutomation`, `ebayAdapter`, shipping decision (consignment skips shipping).
- **Schema fields used**: `items.market_price`, `items.acquired_at`, `items.listing_status`, `items.storage_location`.

## Known limitations

- `storage_location` matching is a substring check on the literal word "store" — fragile.
- Fee model is advisory only; `expectedNet` is computed and surfaced, but the rule tree doesn't yet select channels by maximizing it.
- `crosspost` has no target channel list — it only fires an action with no marketplace payload.
- COMC routing at 120 days ignores whether the item has ever been listed. A never-listed 120-day item probably belongs on eBay first.
- No per-sport or per-era routing (e.g., vintage → PWCC, modern breaks → Fanatics).

## Future work

1. Define a fee table per marketplace and compute `expected_net = sale_price × (1 - fee_rate) - shipping`.
2. Replace `storage_location` string match with a structured `storage_type` enum.
3. Track channel outcomes (sold / unsold / days-to-sell) per category and learn routing from history.
4. Add marketplace blacklists (e.g., suspended eBay account) as hard filters.
