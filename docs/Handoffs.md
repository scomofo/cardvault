# CardVault Workflow Handoffs

Data contracts for moving a card through the pipeline: scan → identify → grade → price → list → ship/sell. Each stage owns specific fields and hands a typed payload to the next.

This document is for contributors adding new workflow steps, integrations, or automation rules. It's descriptive of the current code (`useScanWorkflow.js` on the client; `services/automation/*` and `services/decisions/*` on the server), not aspirational.

## Stage map

```
[scan capture] → [identification] → [CV centering] → [sub-grading]
      ↓                                                    ↓
  intake batch                                       projected_grade
                                                    vault_status
                                                          ↓
                                    [pricing] → [decision engine] → [listing] → [shipping]
```

## 1. Scan capture → intake batch

**Producer:** `useScanWorkflow` (client), `POST /api/automation/intake/batches/:batchId/items`.
**Consumer:** `scanIntakeBulkAutomation.addItemToBatch`.

Payload:
```
{
  itemId:     string,  // uuid for the prospective user_item row
  captureId:  string,  // uuid tying front/back images together
  frontImgId: string,  // references `images` table
  backImgId:  string   // optional; back photo may come later
}
```

Invariants:
- `itemId` must be unique per batch — duplicates are rejected by `detectDuplicateInventory`.
- Images must be uploaded before the batch item is created (they're referenced by id, not embedded).

## 2. Identification

**Producer:** `POST /api/identification/identify`.
**Consumer:** `identificationService.identifyCard`, which writes to `identification_results`.

Input:
```
{ itemId: string, batchItemId?: string, ocrText?: string }
```

Output stored on the item:
```
{
  name, player_name, manufacturer, sport, team,
  card_set, year, card_number, parallel,
  identification_confidence: number (0..1),
  identification_result_id: string  // FK for feedback loop
}
```

Handoff rule: the `/api/identification/confirm` endpoint must be called before the item is eligible for pricing — unconfirmed matches stay in `identification_pending` status. Corrections go through `/api/identification/correct` and train the similarity index.

## 3. CV centering

**Producer:** `cv-service` FastAPI `/analyze` endpoint.
**Consumer:** client `useScanWorkflow` → persisted on item via PUT `/api/items/:id`.

Payload written to `user_items`:
```
{
  cv_centering_lr:    number,  // left/right ratio
  cv_centering_tb:    number,  // top/bottom ratio
  cv_centering_score: number,  // 1..10, feeds projected_grade
  cv_processed:       1
}
```

Handoff rule: CV score is advisory. The authoritative `centering` sub-grade on the item may be manually overridden by the user in the grading UI.

## 4. Sub-grading → projected grade

**Producer:** `GradingSlider` component (client).
**Consumer:** stored directly on `user_items`.

Fields written:
```
{
  centering:       number,  // 1..10
  corners:         number,
  edges:           number,
  surface:         number,
  projected_grade: number,  // Weighted Floor calc
  vault_status:    "GREEN" | "YELLOW" | "RED",
  condition_report: string  // optional narrative
}
```

Invariant: `projected_grade ≤ min(sub_grades) + 1.0` (Weighted Floor rule from `docs/Card-Grading-Logic.md`). `vault_status` maps from projected grade: `GREEN ≥ 9.5`, `YELLOW 8.5–9.4`, `RED < 8.5`.

## 5. Pricing

**Producer:** `POST /api/automation/identify-price/:itemId`.
**Consumer:** `identificationPricingAutomation.automateIdentificationAndPricing`.

Writes to `user_items`:
```
{
  market_price:            number,
  suggested_listing_price: number,
  min_acceptable_price:    number,
  last_comp_price:         number,
  average_comp_price:      number,
  psa9_price:              number,
  psa10_price:             number,
  price_history:           json    // [{ date, price, source }]
}
```

Handoff rule: `psa9_price` and `psa10_price` must be populated before the decision engine can produce a meaningful `gradingDecision` — missing graded comps downgrade the decision to `manual_grade_review`.

## 6. Decision engine

**Producer:** `POST /api/decisions/evaluate` with `{ subjectType, subjectId }`.
**Consumer:** `decisionEngine.evaluateSubject` — fans out to all registered decisions and persists to `decisions` table.

Decision evaluation order (see `decisionEngine.js`):
1. `identificationDecision`
2. `gradingDecision` (needs projected_grade + psa9/10)
3. `pricingDecision`
4. `sellingStrategyDecision`
5. `marketplaceDecision` (reads strategy output via `context.strategyDecision`)
6. `listingReadinessDecision`
7. `shippingDecision`
8. `profitDecision`

Each decision returns:
```
{
  decisionType, subjectType, subjectId,
  recommendation: string,
  confidence:     number (0..1),
  explanation:    string,
  suggestedAction: { type, payload },
  inputsUsed:     object,
  createdAt:      ISO-8601
}
```

Handoff rule: downstream decisions receive upstream results via the `context` object. When adding a new decision, register it in `decisionRegistry.js` and declare any dependencies explicitly — do not reach into the store.

## 7. Listing generation

**Producer:** `POST /api/automation/listings/generate`.
**Consumer:** `listingGenerationAutomation.automateListingGeneration`.

Preconditions (enforced by `listingReadinessDecision`):
- `vault_status ≠ null`
- `market_price > 0`
- `suggested_listing_price > 0`
- `front_img_id` and `back_img_id` set
- `marketplaceDecision.recommendation` must be a publishable channel (`sell_on_ebay`, `store_inventory_shopify`, `crosspost`)

Payload to `listings` table:
```
{
  id, item_id, platform, title, description,
  start_price, buy_now_price, shipping,
  shipping_weight_oz, status: "draft" | "published"
}
```

## 8. Marketplace publish

**Producer:** `POST /api/marketplaces/publish` with `{ listingId, marketplace, connectionId? }`.
**Consumer:** `publishService.publishListingToMarketplace` → adapter in `integrations/marketplaces/`.

Publish must emit a row in `listing_channel_events` (audit trail — see CLAUDE.md invariant: direct DB mutations with event tracking). Adapters return:
```
{ marketplace, externalListingId, status, publishedAt, raw }
```

Crosspost is a fan-out over this endpoint; `crosspostService.crosspostListing` sequences adapter calls and aggregates results.

## 9. Order → shipping

**Producer:** marketplace webhook or manual `POST /api/orders`.
**Consumer:** `POST /api/automation/shipping/:orderId` → `shippingAutomation.automateShipment`.

Order payload (see `orders.routes.js`):
```
{
  platform, salePrice, fees, shippingCharge, taxCollected,
  destinationCountry (default "CA"), destinationPostalCode,
  itemId, listingId
}
```

Shipping handoff rule: the shipping module consumes `destinationCountry` + item weight to pick a carrier. Canada Post integration is currently stubbed — the module returns a placeholder label reference, and actual label purchase is on the Tier 3 roadmap.

## 10. Sale settlement

**Producer:** marketplace sync (`POST /api/marketplaces/sync`) or manual `POST /api/sales`.
**Consumer:** sale row + item status update to `sold`.

On settlement:
- `user_items.sale_status = "sold"`, `sold_at = ISO`, `profit_realized = sale_price - cost_basis - fees - shipping - grading_cost - packaging`.
- A final `profitDecision` runs and closes out the decision chain for that subject.

## Error and rollback contracts

- Any stage failure leaves the item in its prior status — stages are idempotent on `itemId`.
- Decision writes are append-only. To override a stale decision, call `/api/decisions/evaluate` again with `persist: true`; older decisions stay for audit.
- Listing rollback goes through `/api/marketplaces/end`, which emits a matching `listing_channel_events` row. Never delete listing rows — mark them ended.

## When to add a new handoff

1. If a new stage needs fields from earlier stages, declare them in the `context` object passed to `decisionEngine.evaluateSubject` rather than querying the DB directly.
2. Add the data contract to this doc in the same commit as the code.
3. If the stage writes to `user_items`, update `src/server/mappers/fieldMaps.js` so the camel/snake mapping is consistent.
4. If the stage crosses a trust boundary (user input, external API), validate with `requireJsonBody` + field checks from `validation/common.js`.
