import test from "node:test";
import assert from "node:assert/strict";
import { acquisitionDecision } from "../src/server/services/decisions/acquisitionDecision.js";
import { catalogDecision } from "../src/server/services/decisions/catalogDecision.js";
import { exceptionDecision } from "../src/server/services/decisions/exceptionDecision.js";
import { getDecisionNumber } from "../src/server/services/decisions/decisionSettings.js";
import { gradingDecision } from "../src/server/services/decisions/gradingDecision.js";
import { identificationDecision } from "../src/server/services/decisions/identificationDecision.js";
import { listingReadinessDecision } from "../src/server/services/decisions/listingReadinessDecision.js";
import { pricingDecision } from "../src/server/services/decisions/pricingDecision.js";
import { profitDecision } from "../src/server/services/decisions/profitDecision.js";
import { sellingStrategyDecision } from "../src/server/services/decisions/sellingStrategyDecision.js";
import { shippingDecision } from "../src/server/services/decisions/shippingDecision.js";
import { workflowPriorityDecision } from "../src/server/services/decisions/workflowPriorityDecision.js";

function itemContext(item, extras = {}) {
  return { subjectType: "inventory_item", subjectId: "item-1", item, ...extras };
}

function orderContext(order, extras = {}) {
  return { subjectType: "order", subjectId: "order-1", order, ...extras };
}

// --- listingReadinessDecision ---

test("listingReadinessDecision ignores non-inventory subjects", () => {
  assert.equal(listingReadinessDecision(orderContext({})), null);
});

test("listingReadinessDecision flags publish_ready when every field is present", () => {
  const decision = listingReadinessDecision(
    itemContext(
      { front_img_id: "img-1", condition: "NM", suggested_listing_price: 25 },
      {
        latestListing: {
          listing_title: "Card",
          listing_description: "Nice card",
          item_specifics: "{}",
          shipping_profile: "standard",
        },
      },
    ),
  );
  assert.equal(decision.recommendation, "publish_ready");
  assert.equal(decision.confidence, 0.92);
  assert.equal(decision.suggestedAction.type, "publish_listing");
});

test("listingReadinessDecision downgrades to draft_ready when priced but incomplete", () => {
  const decision = listingReadinessDecision(
    itemContext(
      { front_img_id: "img-1", condition: "NM", market_price: 12 },
      { latestListing: { listing_description: "d", item_specifics: "{}", shipping_profile: "s" } },
    ),
  );
  assert.equal(decision.recommendation, "draft_ready");
  assert.equal(decision.suggestedAction.type, "save_draft");
  assert.match(decision.explanation, /Title is missing\./);
});

test("listingReadinessDecision accepts listing start_price as the price source", () => {
  const decision = listingReadinessDecision(
    itemContext({ front_img_id: "img-1" }, { latestListing: { start_price: 9.99 } }),
  );
  assert.equal(decision.inputsUsed.hasPrice, true);
  assert.equal(decision.recommendation, "draft_ready");
});

test("listingReadinessDecision reports every missing field when unpriced", () => {
  const decision = listingReadinessDecision(itemContext({}));
  assert.equal(decision.recommendation, "missing_required_fields");
  assert.equal(decision.confidence, 0.66);
  assert.equal(decision.suggestedAction.type, "open_listing_editor");
  for (const part of [
    "Images are missing.",
    "A price has not been assigned.",
    "Title is missing.",
    "Description is missing.",
    "Item specifics are missing.",
    "Condition is missing.",
    "Shipping profile is missing.",
  ]) {
    assert.ok(decision.explanation.includes(part), `expected explanation to include "${part}"`);
  }
});

// --- sellingStrategyDecision ---

test("sellingStrategyDecision returns null without an inventory item", () => {
  assert.equal(sellingStrategyDecision(orderContext({})), null);
  assert.equal(sellingStrategyDecision({ subjectType: "inventory_item" }), null);
});

test("sellingStrategyDecision maps conditions to strategies", () => {
  const cases = [
    // cheap and stale → bundle
    { item: { market_price: 10 }, extras: { ageDays: 40 }, expected: "bundle_with_similar", action: "add_to_bundle_queue" },
    // duplicates → bundle even at healthy price
    { item: { market_price: 50 }, extras: { ageDays: 10, duplicateCount: 2 }, expected: "bundle_with_similar", action: "add_to_bundle_queue" },
    // strong projected grade with PSA10 upside → grade first
    { item: { market_price: 50, projected_grade: 9.5, psa10_price: 95 }, extras: { ageDays: 10 }, expected: "grade_before_sale", action: "move_to_grading_queue" },
    // rising market on fresh inventory → hold
    { item: { market_price: 50 }, extras: { ageDays: 30, marketTrend: 0.2 }, expected: "hold", action: "mark_hold_box" },
    // stale inventory → sell now
    { item: { market_price: 50 }, extras: { ageDays: 90 }, expected: "sell_now", action: "create_listing" },
    // falling market → sell now
    { item: { market_price: 50 }, extras: { ageDays: 50, marketTrend: -0.1 }, expected: "sell_now", action: "create_listing" },
    // high value → auction
    { item: { market_price: 150 }, extras: { ageDays: 50 }, expected: "auction_recommended", action: "create_listing" },
    // volatile market past the hold window → auction
    { item: { market_price: 50 }, extras: { ageDays: 60, marketTrend: 0.2 }, expected: "auction_recommended", action: "create_listing" },
    // nothing notable → fixed price
    { item: { market_price: 50 }, extras: { ageDays: 10 }, expected: "fixed_price_recommended", action: "create_listing" },
  ];
  for (const { item, extras, expected, action } of cases) {
    const decision = sellingStrategyDecision(itemContext(item, extras));
    assert.equal(decision.recommendation, expected, JSON.stringify({ item, extras }));
    assert.equal(decision.suggestedAction.type, action);
  }
});

// --- catalogDecision ---

test("catalogDecision returns null without an inventory item", () => {
  assert.equal(catalogDecision(orderContext({})), null);
  assert.equal(catalogDecision({ subjectType: "inventory_item" }), null);
});

test("catalogDecision maps data completeness to recommendations", () => {
  const readyToList = catalogDecision(
    itemContext({ name: "Card", market_price: 20, storage_location: "Box 1", cost_basis: 5 }),
  );
  assert.equal(readyToList.recommendation, "ready_to_list");
  assert.equal(readyToList.suggestedAction.type, "save_inventory_item");
  assert.equal(readyToList.explanation, "Core catalog fields are present.");

  const readyToCatalog = catalogDecision(
    itemContext({ player_name: "Player", binder: "Binder A", cost_basis: 5 }),
  );
  assert.equal(readyToCatalog.recommendation, "ready_to_catalog");
  assert.equal(readyToCatalog.suggestedAction.type, "open_condition_review");
  assert.match(readyToCatalog.explanation, /Pricing is missing\./);

  const missingCost = catalogDecision(itemContext({}));
  assert.equal(missingCost.recommendation, "missing_cost_basis");
  assert.equal(missingCost.suggestedAction.type, "request_cost_basis");

  const incomplete = catalogDecision(itemContext({ cost_basis: 5 }));
  assert.equal(incomplete.recommendation, "incomplete_record");
  assert.equal(incomplete.suggestedAction.type, "open_condition_review");
});

// --- pricingDecision ---

test("pricingDecision returns null without an inventory item", () => {
  assert.equal(pricingDecision(orderContext({})), null);
});

test("pricingDecision requires usable comp data", () => {
  const noSnapshot = pricingDecision(itemContext({}));
  assert.equal(noSnapshot.recommendation, "manual_price_review");
  assert.equal(noSnapshot.confidence, 0.42);
  assert.equal(noSnapshot.suggestedAction.type, "flag_pricing_review");
  assert.match(noSnapshot.explanation, /Sample size is 0\./);

  const thinSample = pricingDecision(
    itemContext({}, { latestPriceSnapshot: { sample_size: 1, last_comp_price_cents: 1000 } }),
  );
  assert.equal(thinSample.recommendation, "manual_price_review");

  const noComp = pricingDecision(
    itemContext({}, { latestPriceSnapshot: { sample_size: 5, last_comp_price_cents: 0 } }),
  );
  assert.equal(noComp.recommendation, "manual_price_review");
});

test("pricingDecision lists at market by default", () => {
  const decision = pricingDecision(
    itemContext({}, {
      latestPriceSnapshot: { sample_size: 4, last_comp_price_cents: 1000, high_price_cents: 1500 },
    }),
  );
  assert.equal(decision.recommendation, "list_at_market");
  assert.equal(decision.suggestedAction.valueCents, 1000);
  assert.equal(decision.suggestedAction.premiumValueCents, 1500);
  assert.equal(decision.confidence, 0.72);
});

test("pricingDecision discounts stale inventory in a falling market", () => {
  const decision = pricingDecision(
    itemContext({}, {
      ageDays: 60,
      marketTrend: -0.06,
      latestPriceSnapshot: { sample_size: 4, last_comp_price_cents: 1000, high_price_cents: 1500 },
    }),
  );
  assert.equal(decision.recommendation, "list_quick_sale");
  assert.equal(decision.suggestedAction.valueCents, 900);
  assert.match(decision.explanation, /Inventory age is 60 days\./);
  assert.match(decision.explanation, /Market trend is down 6\.0%\./);
});

test("pricingDecision prices at premium in a rising market with deep comps", () => {
  const decision = pricingDecision(
    itemContext({}, {
      marketTrend: 0.2,
      latestPriceSnapshot: { sample_size: 8, last_comp_price_cents: 1000, high_price_cents: 1500 },
    }),
  );
  assert.equal(decision.recommendation, "list_premium");
  assert.equal(decision.suggestedAction.valueCents, 1500);
  assert.equal(decision.confidence, 0.9);
  assert.match(decision.explanation, /Market trend is rising 20\.0%\./);
});

test("pricingDecision falls back to last comp when no high comp exists", () => {
  const decision = pricingDecision(
    itemContext({}, {
      marketTrend: 0.2,
      latestPriceSnapshot: { sample_size: 5, last_comp_price_cents: 1000 },
    }),
  );
  assert.equal(decision.recommendation, "list_premium");
  assert.equal(decision.suggestedAction.valueCents, 1000);
});

// --- gradingDecision ---

test("gradingDecision returns null without an inventory item", () => {
  assert.equal(gradingDecision(orderContext({})), null);
});

test("gradingDecision recommends grade_now on large expected upside", () => {
  // EV at projected 9.5 with psa9=400/psa10=500 is 450 → upside 415 after $25 cost
  const decision = gradingDecision(
    itemContext({ market_price: 10, psa9_price: 400, psa10_price: 500, projected_grade: 9.5 }),
  );
  assert.equal(decision.recommendation, "grade_now");
  assert.equal(decision.suggestedAction.type, "move_to_grading_queue");
  assert.equal(decision.confidence, 0.74);
});

test("gradingDecision recommends maybe_grade on modest upside", () => {
  // EV at projected 9.5 with psa9=130/psa10=150 is 140 → upside 15 after $25 cost
  const decision = gradingDecision(
    itemContext({ market_price: 100, psa9_price: 130, psa10_price: 150, projected_grade: 9.5 }),
  );
  assert.equal(decision.recommendation, "maybe_grade");
  assert.equal(decision.suggestedAction.type, "rerun_with_assumed_grade");
});

test("gradingDecision recommends sell_raw when grading cost eats the upside", () => {
  const decision = gradingDecision(
    itemContext({ market_price: 100, psa9_price: 110, psa10_price: 120, projected_grade: 9.5 }),
  );
  assert.equal(decision.recommendation, "sell_raw");
  assert.equal(decision.suggestedAction.type, "mark_sell_raw");
});

test("gradingDecision recommends sell_raw below the minimum projected grade", () => {
  const decision = gradingDecision(
    itemContext({ market_price: 50, psa9_price: 80, psa10_price: 100, projected_grade: 6 }),
  );
  assert.equal(decision.recommendation, "sell_raw");
});

test("gradingDecision defers to manual review without graded comps", () => {
  const decision = gradingDecision(itemContext({ market_price: 50 }));
  assert.equal(decision.recommendation, "manual_grade_review");
  assert.equal(decision.confidence, 0.41);
  assert.equal(decision.inputsUsed.projectedGrade, 8);
  assert.equal(decision.inputsUsed.expectedGradedValue, 0);
  assert.match(decision.explanation, /Graded comp data is limited\./);
});

test("getDecisionNumber rejects unknown setting keys", () => {
  assert.throws(() => getDecisionNumber("not_a_real_setting"), /Unknown decision setting/);
});

// --- shippingDecision ---

test("shippingDecision returns null without an order", () => {
  assert.equal(shippingDecision(itemContext({})), null);
  assert.equal(shippingDecision({ subjectType: "order" }), null);
});

test("shippingDecision maps destination and value to a service level", () => {
  const cases = [
    { order: { sale_price: 10 }, expected: "use_plain_mail" },
    { order: { sale_price: 50, destination_country: "CA" }, expected: "use_tracked_parcel" },
    { order: { sale_price: 150, destination_country: "CA" }, expected: "use_expedited_parcel" },
    { order: { sale_price: 10, destination_country: "US" }, expected: "use_usa_lettermail" },
    { order: { sale_price: 50, destination_country: "US" }, expected: "use_tracked_packet_usa" },
    { order: { sale_price: 200, destination_country: "US" }, expected: "use_courier" },
  ];
  for (const { order, expected } of cases) {
    const decision = shippingDecision(orderContext(order));
    assert.equal(decision.recommendation, expected, JSON.stringify(order));
    assert.equal(decision.suggestedAction.type, "choose_service_level");
  }
});

test("shippingDecision combines multi-item orders", () => {
  const decision = shippingDecision(orderContext({ sale_price: 150, item_count: 2 }));
  assert.equal(decision.recommendation, "combine_shipment");
  assert.equal(decision.suggestedAction.type, "combine_order");
});

test("shippingDecision warns when shipping cost eats the margin", () => {
  const decision = shippingDecision(
    orderContext({ sale_price: 150, destination_country: "CA", shipping_cost: 40 }),
  );
  assert.equal(decision.recommendation, "shipping_cost_warning");
  assert.equal(decision.suggestedAction.type, "review_shipping_profit");
});

test("shippingDecision applies defaults for count, weight, and destination", () => {
  const decision = shippingDecision(orderContext({ sale_price: 10 }));
  assert.deepEqual(decision.inputsUsed, {
    salePrice: 10,
    itemCount: 1,
    destinationCountry: "CA",
    weightOz: 3,
  });
  assert.match(decision.explanation, /3\.0 oz/);
});

// --- exceptionDecision ---

test("exceptionDecision flags incomplete inventory items", () => {
  const decision = exceptionDecision(itemContext({}));
  assert.equal(decision.recommendation, "manual_review_required");
  assert.deepEqual(decision.inputsUsed.issues, [
    "identity is incomplete",
    "cost basis is missing",
    "pricing data is unavailable",
  ]);
  assert.equal(decision.suggestedAction.type, "create_review_task");
  assert.deepEqual(decision.suggestedAction.reasons, decision.inputsUsed.issues);
});

test("exceptionDecision passes complete inventory items", () => {
  const context = itemContext(
    { player_name: "Player", cost_basis: 5 },
    { latestPriceSnapshot: { sample_size: 3 } },
  );
  assert.equal(exceptionDecision(context), null);
});

test("exceptionDecision flags orders missing platform or price", () => {
  const decision = exceptionDecision(orderContext({}));
  assert.deepEqual(decision.inputsUsed.issues, [
    "marketplace source is missing",
    "sale price is missing",
  ]);
});

test("exceptionDecision passes complete orders and unrelated subjects", () => {
  assert.equal(exceptionDecision(orderContext({ platform: "ebay", sale_price: 25 })), null);
  assert.equal(exceptionDecision({ subjectType: "purchase", purchase: {} }), null);
});

// --- acquisitionDecision ---

test("acquisitionDecision returns null for non-purchase subjects", () => {
  assert.equal(acquisitionDecision(itemContext({})), null);
});

test("acquisitionDecision recommends buy_now on a wide spread", () => {
  const decision = acquisitionDecision({
    subjectType: "purchase",
    subjectId: "purchase-1",
    purchase: { total_cost: 100, estimated_exit_value: 130 },
  });
  assert.equal(decision.recommendation, "buy_now");
  assert.equal(decision.suggestedAction.type, "set_max_buy_price");
  assert.equal(decision.suggestedAction.value, 104);
});

test("acquisitionDecision recommends waiting on a thin spread", () => {
  const decision = acquisitionDecision({
    subjectType: "purchase",
    subjectId: "purchase-1",
    purchase: { total_cost: 100, estimated_exit_value: 110 },
  });
  assert.equal(decision.recommendation, "buy_if_price_drops");
  assert.equal(decision.suggestedAction.type, "create_watch_entry");
});

test("acquisitionDecision assumes a 20% exit premium when none is provided", () => {
  const decision = acquisitionDecision({
    subjectType: "purchase",
    subjectId: "purchase-1",
    purchase: { price: 100 },
  });
  assert.ok(Math.abs(decision.inputsUsed.estimatedExitValue - 120) < 1e-9);
  assert.equal(decision.inputsUsed.askingPrice, 100);
  assert.equal(decision.recommendation, "buy_if_price_drops");
});

// --- profitDecision ---

test("profitDecision returns null without an inventory item", () => {
  assert.equal(profitDecision(orderContext({})), null);
});

test("profitDecision maps age and margin to recommendations", () => {
  const cases = [
    { item: { market_price: 10, cost_basis: 10 }, extras: { ageDays: 10 }, expected: "protect_margin", action: "mark_clearance" },
    { item: { sale_status: "listed" }, extras: { ageDays: 90 }, expected: "drop_price", action: "revise_listing_price" },
    { item: { sale_status: "sold" }, extras: { ageDays: 90 }, expected: "protect_margin", action: "mark_clearance" },
    { item: { sale_status: "listed" }, extras: { ageDays: 180 }, expected: "liquidate", action: "revise_listing_price" },
    { item: { profit_realized: 60 }, extras: { ageDays: 10 }, expected: "top_performer", action: "mark_clearance" },
    { item: { market_price: 100, cost_basis: 10 }, extras: { ageDays: 10 }, expected: "hold_for_market", action: "add_hold_tag" },
  ];
  for (const { item, extras, expected, action } of cases) {
    const decision = profitDecision(itemContext(item, extras));
    assert.equal(decision.recommendation, expected, JSON.stringify({ item, extras }));
    assert.equal(decision.suggestedAction.type, action);
  }
});

// --- identificationDecision ---

test("identificationDecision maps confidence and imagery to next steps", () => {
  const autoAccept = identificationDecision(
    itemContext({ cv_centering_score: 0.97, front_img_id: "f", back_img_id: "b" }),
  );
  assert.equal(autoAccept.recommendation, "auto_accept_match");
  assert.equal(autoAccept.suggestedAction.type, "accept_card_identity");

  const review = identificationDecision(
    itemContext({ cv_centering_score: 0.85, front_img_id: "f", back_img_id: "b" }),
  );
  assert.equal(review.recommendation, "needs_manual_review");
  assert.equal(review.suggestedAction.type, "open_review_queue");

  const backScan = identificationDecision(
    itemContext({ cv_centering_score: 0.5, front_img_id: "f" }),
  );
  assert.equal(backScan.recommendation, "requires_back_scan");
  assert.equal(backScan.suggestedAction.type, "prompt_back_scan");

  const unresolved = identificationDecision(itemContext({ cv_centering_score: 0.5 }));
  assert.equal(unresolved.recommendation, "unresolved");
  assert.equal(unresolved.suggestedAction.type, "open_review_queue");
});

test("identificationDecision clamps confidence at the upper bound", () => {
  const decision = identificationDecision(
    itemContext({ cv_centering_score: 1.2, front_img_id: "f", back_img_id: "b" }),
  );
  assert.equal(decision.confidence, 0.98);
  assert.match(decision.explanation, /front and back/);
});

// --- workflowPriorityDecision ---

test("workflowPriorityDecision maps subject and signals to queue actions", () => {
  const cases = [
    { context: { subjectType: "order", subjectId: "o-1" }, expected: "ship_now" },
    { context: itemContext({}, { ageDays: 90 }), expected: "reprice_now" },
    { context: itemContext({ market_price: 100 }, { ageDays: 10 }), expected: "list_first" },
    { context: itemContext({ market_price: 10 }, { ageDays: 10 }), expected: "review_alert_now" },
  ];
  for (const { context, expected } of cases) {
    assert.equal(workflowPriorityDecision(context).recommendation, expected);
  }
});

test("workflowPriorityDecision scales confidence with the priority score", () => {
  const low = workflowPriorityDecision(itemContext({}, { priorityScore: 20 }));
  assert.ok(Math.abs(low.confidence - 0.7) < 1e-9);
  const capped = workflowPriorityDecision(itemContext({}, { priorityScore: 200 }));
  assert.equal(capped.confidence, 0.95);
  assert.equal(capped.suggestedAction.value, 200);
});
