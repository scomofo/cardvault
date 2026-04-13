# Grade-vs-Sell Engine

Documents the decision logic in `src/server/services/decisions/gradingDecision.js`. This is a spec for existing code, not a proposal.

## Purpose

For each inventory item, decide whether the EV of submitting for professional grading (PSA) exceeds the EV of selling raw, after grading cost and grade risk.

## Inputs

| Field | Source | Notes |
|---|---|---|
| `item.market_price` | `items` table / pricing decision | Raw comp value, CAD |
| `item.last_comp_price` | fallback if `market_price` missing | |
| `item.psa10_price` | graded comps lookup | PSA 10 target |
| `item.psa9_price` | graded comps lookup | PSA 9 target |
| `item.projected_grade` | CV centering + manual sub-grades | Float 1–10 |
| `gradingCost` | `settings.grading_cost` | Default $25; override via PUT `/api/settings` |

## Algorithm

```
targetValue = expectedGradedValue(projectedGrade, {raw, psa9, psa10})
upside      = targetValue - raw - gradingCost

if hasComps and upside > grading_upside_grade_now  → grade_now
elif hasComps and upside > grading_upside_maybe    → maybe_grade
elif projectedGrade < grading_min_projected_grade  → sell_raw
elif no comps                                      → manual_grade_review
else                                               → sell_raw
```

`expectedGradedValue` lives in `services/decisions/gradeRiskModel.js`. It evaluates
three grade points around the projection — `projected - 0.5`, `projected`, and
`projected + 0.5` — with weights `0.25 / 0.5 / 0.25`. Value at each grade is
interpolated between raw, PSA9, and PSA10 comps. This replaces the previous
"assume projected grade is the realized grade" point estimate.

All thresholds live in `services/decisions/decisionSettings.js` with defaults
`grading_upside_grade_now=40`, `grading_upside_maybe=10`, `grading_min_projected_grade=7.5`.

## Outputs

| Recommendation | Action | When |
|---|---|---|
| `grade_now` | `move_to_grading_queue` | High-confidence upside ≥ $40 |
| `maybe_grade` | `rerun_with_assumed_grade` | Borderline $10–$40 upside |
| `sell_raw` | `mark_sell_raw` | Low projected grade or negative EV |
| `manual_grade_review` | `rerun_with_assumed_grade` | Missing graded comp data |

Confidence: `0.74` when graded comps exist, `0.41` when missing. These are hardcoded and not calibrated from historical outcomes — see open issues.

## Interactions

- **Upstream**: `identificationDecision` (provides card id), `pricingDecision` (provides raw + graded comps), CV service (provides centering → projected grade floor).
- **Downstream**: `sellingStrategyDecision` reads `projectedGrade` and `psa10_price` to upgrade to `grade_before_sale` independently. Both can fire; `decisionEngine.js` resolves ordering.
- **Schema fields used**: `centering`, `corners`, `edges`, `surface`, `projected_grade`, `vault_status` (see `schema.js:48-54`).

## Known limitations

- `gradingCost` is a single scalar. Should vary by service tier (PSA Value / Regular / Express) and card value band — currently one value applied to all items.
- No factoring of turnaround time or cash-flow preference.
- Distribution weights (0.25/0.5/0.25) are defensible defaults, not calibrated from outcomes. Replace with a historical model once enough projected-vs-actual grades are tracked.
- Confidence values are not derived from outcomes; add calibration loop once enough graded submissions are tracked.
- Does not consult `duplicateCount` — a second copy of a borderline card changes the EV.

## Future work

1. Replace the single `grading_cost` setting with a lookup keyed on projected value and service tier.
2. Persist historical projected-vs-actual grades to calibrate the distribution weights and confidence values.
