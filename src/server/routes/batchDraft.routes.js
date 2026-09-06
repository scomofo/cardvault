import { all, get, run, runInImmediateTransaction } from "../database.js";
import { ITEM_FIELD_MAP, LISTING_FIELD_MAP } from "../mappers/fieldMaps.js";
import { toCamel } from "../mappers/recordMappers.js";
import { readImageFile } from "../services/imageStore.js";
import { requireProtectedConfigWrite } from "../auth.js";

const CONDITIONS = new Set(["gem_mint", "mint", "near_mint", "excellent", "very_good", "good", "fair", "poor"]);
const ID = /^[a-zA-Z0-9_-]{1,120}$/;
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function string(value, name, max, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(`${name} is missing or invalid`);
  return value;
}
function money(value, name, positive = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < (positive ? 0.01 : 0) || value > 1000000) fail(`${name} is invalid`);
  return Math.round(value * 100) / 100;
}

// Create-only draft operation: never calls a marketplace, and never overwrites
// an existing card or another workflow's draft. Item + listing commit atomically.
export function createReviewedBatchDraft(body) {
  if (!body || typeof body !== "object" || !["photo", "inventory"].includes(body.source)) fail("Invalid draft request");
  const { item, draft, batchId } = body;
  if (!item || !draft || ![item.id, draft.id, batchId].every((id) => typeof id === "string" && ID.test(id))) fail("Invalid item, draft or batch ID");
  if (draft.cardId !== item.id || draft.platform !== "ebay" || draft.format !== "fixed") fail("Only linked eBay fixed-price drafts are supported");
  if (body.identityConfirmed !== true || body.conditionConfirmed !== true) fail("Identity and inspected condition must be confirmed");
  if (!CONDITIONS.has(item.condition)) fail("Choose an inspected condition");
  string(item.name, "Card name", 300, true);
  for (const field of ["set", "number", "year", "parallel", "rarity", "type", "storageLocation"]) string(item[field] ?? "", field, 500);
  string(draft.listingTitle, "Title", 80, true);
  string(draft.listingDescription, "Description", 10000, true);
  const price = money(draft.startPrice, "Price", true), shipping = money(draft.shipping, "Buyer shipping");
  const profile = {
    currency: "CAD", estimatedPostage: money(draft.shippingProfile?.estimatedPostage, "Estimated postage"),
    packagingCost: money(draft.shippingProfile?.packagingCost, "Packaging cost"),
  };
  const cost = money(item.costBasis ?? 0, "Acquisition cost");
  if (!Array.isArray(item.priceHistory ?? [])) fail("Invalid price history");
  if (JSON.stringify(item.priceEstimate ?? {}).length > 50000 || JSON.stringify(item.priceHistory ?? []).length > 50000) fail("Pricing evidence is too large");

  return runInImmediateTransaction(() => {
    let storedItem = get("SELECT * FROM user_items WHERE id = ?", [item.id]);
    const existing = get("SELECT * FROM listings WHERE id = ?", [draft.id]);
    if (existing) {
      const channels = all("SELECT id FROM listing_channels WHERE listing_id = ?", [existing.id]);
      if (existing.card_id !== item.id || existing.export_batch_id !== batchId || existing.status !== "draft" || existing.publish_status !== "draft" || existing.external_listing_id || channels.length) {
        fail("This draft changed or entered publication. Review it in Sales before continuing.", 409);
      }
      if (!storedItem || storedItem.status === "sold" || storedItem.sale_status === "sold") fail("This card is no longer available", 409);
      return { item: toCamel(storedItem, ITEM_FIELD_MAP), listing: toCamel(existing, LISTING_FIELD_MAP), reused: true };
    }
    if (body.source === "inventory" && !storedItem) fail("The selected card no longer exists", 404);
    if (storedItem && (["sold", "listed"].includes(storedItem.status) || storedItem.sale_status === "sold")) fail("This card is sold or already listed", 409);
    if (get("SELECT id FROM listings WHERE card_id = ? AND status != 'ended' LIMIT 1", [item.id])) fail("This card already has a draft or listing. Open it in Sales.", 409);
    if (get("SELECT c.id FROM listing_channels c JOIN listings l ON l.id = c.listing_id WHERE l.card_id = ? AND c.status NOT IN ('ended', 'sold') LIMIT 1", [item.id])) fail("This card has marketplace activity that needs review", 409);
    if (body.expectedItemUpdatedAt && storedItem?.updated_at !== body.expectedItemUpdatedAt) fail("This card changed since selection. Remove it from the batch and select it again.", 409);
    if (storedItem && (storedItem.front_img_id !== item.frontImgId || storedItem.back_img_id !== item.backImgId)) fail("The card photos changed. Select it again from inventory.", 409);
    for (const id of [storedItem?.front_img_id || item.frontImgId, storedItem?.back_img_id || item.backImgId]) {
      if (!id || !readImageFile(id)) fail("Both front and back photos must reach the server before saving a draft", 409);
    }
    if (!storedItem) {
      run(`INSERT INTO user_items
        (id, name, card_set, card_number, year, parallel, rarity, type, condition, storage_location,
         front_img_id, back_img_id, cost_basis, price_estimate, price_history, status, listing_status, sale_status, listed_on)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'inventory','draft','available','[]')`,
      [item.id, item.name, item.set || "", item.number || "", item.year || "", item.parallel || "", item.rarity || "", item.type || "sports", item.condition, item.storageLocation || "",
        item.frontImgId, item.backImgId, cost, JSON.stringify(item.priceEstimate || {}), JSON.stringify(item.priceHistory || [])]);
    }
    run(`INSERT INTO listings
      (id, card_id, card_name, card_set, card_number, platform, format, listing_title, listing_description,
       start_price, shipping, shipping_profile, item_specifics, image_count, quantity, status, publish_status,
       automation_state, export_batch_id, notes)
       VALUES (?,?,?,?,?,'ebay','fixed',?,?,?,?,?,?,2,1,'draft','draft','draft',?,?)`,
    [draft.id, item.id, item.name, item.set || "", item.number || "", draft.listingTitle, draft.listingDescription, price, shipping,
      JSON.stringify(profile), JSON.stringify({ Condition: item.condition, Parallel: item.parallel || "", Currency: "CAD" }), batchId,
      "Batch-reviewed draft only; not marketplace-validated or published."]);
    // Keep existing costs, identity, photos and condition intact; only mark the draft workflow.
    run("UPDATE user_items SET listing_status = 'draft' WHERE id = ?", [item.id]);
    storedItem = get("SELECT * FROM user_items WHERE id = ?", [item.id]);
    return { item: toCamel(storedItem, ITEM_FIELD_MAP), listing: toCamel(get("SELECT * FROM listings WHERE id = ?", [draft.id]), LISTING_FIELD_MAP), reused: false };
  });
}

export function registerBatchDraftRoutes(app) {
  app.post("/api/listings/draft", requireProtectedConfigWrite, (req, res) => {
    try { const result = createReviewedBatchDraft(req.body); res.status(result.reused ? 200 : 201).json(result); }
    catch (error) { res.status(error.status || 500).json({ error: error.message }); }
  });
}
