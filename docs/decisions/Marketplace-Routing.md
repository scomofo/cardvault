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
    AND item has prior marketplace exposure
    → eligible = {comc}
ageDays > marketplace_stale_days_comc
    AND item has no prior marketplace exposure
    → eligible = {ebay}
listing_status == listed AND ageDays > marketplace_stale_days_crosspost
    → recommendation = crosspost (special action; primary channel stays unchanged, target marketplaces are explicit)
structured store signal is "store", "shopify", or "retail"
    → eligible = {shopify}
strategy == auction_recommended
    → eligible = {ebay}
```

**Unconstrained case** — no hard constraint fires:

```
eligible = adapter-backed open channels, currently {ebay, shopify}
selected = argmax(expectedNet) over eligible
```

All thresholds live in `services/decisions/decisionSettings.js`. Defaults:
`marketplace_consignment_threshold=500`, `marketplace_low_value_floor=10`,
`marketplace_stale_days_comc=120`, `marketplace_stale_days_crosspost=60`.

> Note on TCGplayer / Mercari: both are in the fee table and still appear in
> `channelNets`, but they are reported under `unavailableChannels` and are not
> eligible for selection until adapters land.

## Outputs

| Recommendation | Action | Marketplace tag |
|---|---|---|
| `sell_on_ebay` | `assign_marketplace` | `ebay` |
| `consign_high_end` | `route_to_consignment` | — |
| `send_to_comc` | `assign_marketplace` | `comc` |
| `store_inventory_shopify` | `assign_marketplace` | `shopify` |
| `crosspost` | `create_crosspost_plan` | primary channel plus explicit `marketplaces` targets |
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

These are defaults only. A rate stored in the `fee_models` table (via
`PUT /api/fee-models/:platform`, surfaced in Settings) overrides the default
for that platform, so routing scores negotiated rates rather than list rates.
Flat fees stay at the default because `fee_models` models a percentage rate
only; a stored rate for a platform with no default entry is priced with a $0
flat fee. Platform matching is case-insensitive, and a stored rate outside
0..1 is ignored in favour of the default.

`inputsUsed` carries the full scoring context: `eligibleChannels`,
`selectedChannel`, `expectedNet`, `targetMarketplaces`, `channelNets` (all
fee-table entries), `unavailableChannels`, `unconstrainedBest` (the global
optimum regardless of constraints), and `selectionReason` (human-readable
explanation of which rule fired). The explanation also flags when the selected
channel is not the unconstrained best, making the opportunity cost of a hard
constraint visible to operators.

## Interactions

- **Upstream**: `sellingStrategyDecision` (read via `context.strategyDecision`). Must run after strategy in `decisionEngine.js`.
- **Downstream**: `listingGenerationAutomation`, `ebayAdapter`, shipping decision (consignment skips shipping).
- **Schema fields used**: `items.market_price`, `items.acquired_at`, `items.listing_status`, `items.storage_location`.

## Known limitations

- Flat fees are not overridable per-account — only the percentage rate is (`fee_models` has no flat-fee column).
- TCGplayer and Mercari are scored but have no adapter, so they are disclosed but not selected.
- Persisted inventory rows do not yet have a dedicated `storage_type`; exact `storage_location` tags and structured context fields can carry the store signal.
- No per-sport or per-era routing (e.g., vintage → PWCC, modern breaks → Fanatics).

## Future work

1. Replace `storage_location` substring match with a structured `storage_type` enum.
2. Track channel outcomes (sold / unsold / days-to-sell) per category and learn routing from history.
3. Add marketplace blacklists (e.g., suspended eBay account) as hard filters.
4. Land TCGplayer / Mercari adapters so scored channels are actually routable.
