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

## Algorithm (eligibility filter + max-net selector)

The rule tree builds a set of *eligible* channels based on hard constraints,
then selects the channel with the highest expected net within that set.

**Hard-constraint filters** (first match wins, produces a forced eligible set):

```
marketPrice > marketplace_consignment_threshold
    → eligible = {consignment}
strategy == bundle_with_similar OR marketPrice < marketplace_low_value_floor
    → eligible = {local}
ageDays > marketplace_stale_days_comc
    → eligible = {comc}
listing_status == listed AND ageDays > marketplace_stale_days_crosspost
    → recommendation = crosspost (special action; primary channel stays eBay)
storage_location contains "store"
    → eligible = {shopify}
strategy == auction_recommended
    → eligible = {ebay}
```

**Unconstrained case** — no hard constraint fires:

```
eligible = {ebay, tcgplayer, mercari, shopify}
selected = argmax(expectedNet) over eligible
```

All thresholds live in `services/decisions/decisionSettings.js`. Defaults:
`marketplace_consignment_threshold=500`, `marketplace_low_value_floor=10`,
`marketplace_stale_days_comc=120`, `marketplace_stale_days_crosspost=60`.

> Note on TCGplayer / Mercari: both are in the fee table and scored, but
> their adapter code doesn't exist yet. If they score highest, the decision
> currently falls through to the eBay recommendation — treat them as
> disclosure-only until adapters land.

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

`inputsUsed` carries the full scoring context: `eligibleChannels`,
`selectedChannel`, `expectedNet`, `channelNets` (all fee-table entries),
`unconstrainedBest` (the global optimum regardless of constraints), and
`selectionReason` (human-readable explanation of which rule fired). The
explanation also flags when the selected channel is not the unconstrained
best, making the opportunity cost of a hard constraint visible to operators.

## Interactions

- **Upstream**: `sellingStrategyDecision` (read via `context.strategyDecision`). Must run after strategy in `decisionEngine.js`.
- **Downstream**: `listingGenerationAutomation`, `ebayAdapter`, shipping decision (consignment skips shipping).
- **Schema fields used**: `items.market_price`, `items.acquired_at`, `items.listing_status`, `items.storage_location`.

## Known limitations

- `storage_location` matching is a substring check on the literal word "store" — fragile.
- Fee rates are defaults, not negotiated per-account. Override-via-settings is a future feature.
- TCGplayer and Mercari are scored but have no adapter, so they fall back to the eBay recommendation when selected.
- `crosspost` has no target channel list — it only fires an action with no marketplace payload.
- COMC routing at 120 days ignores whether the item has ever been listed. A never-listed 120-day item probably belongs on eBay first.
- No per-sport or per-era routing (e.g., vintage → PWCC, modern breaks → Fanatics).

## Future work

1. Replace `storage_location` substring match with a structured `storage_type` enum.
2. Track channel outcomes (sold / unsold / days-to-sell) per category and learn routing from history.
3. Add marketplace blacklists (e.g., suspended eBay account) as hard filters.
4. Expose per-account negotiated fee rates via settings so `computeExpectedNet` uses real numbers.
5. Land TCGplayer / Mercari adapters so scored channels are actually routable.
