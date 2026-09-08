import { cardEstimate, catalogStatus } from "./catalogState.js";
import { listingLifecycle } from "./scanPublish.js";
import { CONDITIONS } from "./constants.js";
import { buildDraftContent } from "./listingContent.js";

const OPEN_FULFILLMENT = new Set(["pending", "paid", "processing", "label_purchased", "shipping_exception"]);
let draftSaveRunning = false;
const draftSaveListeners = new Set();
export const isDraftSaveRunning = () => draftSaveRunning;
export function subscribeDraftSave(listener) {
  draftSaveListeners.add(listener);
  return () => draftSaveListeners.delete(listener);
}

export async function saveReviewedListingDrafts(options) {
  if (draftSaveRunning) throw new Error("A draft save is still finishing. Wait a moment and retry.");
  draftSaveRunning = true;
  draftSaveListeners.forEach((listener) => listener(true));
  try { return await persistReviewedListingDrafts(options); }
  finally { draftSaveRunning = false; draftSaveListeners.forEach((listener) => listener(false)); }
}

export function prepareListingCandidates(catalog = [], listings = [], orders = []) {
  const reserved = new Set(listings.filter((listing) => listing.status !== "ended").map((listing) => listing.cardId));
  // A recorded order is stronger evidence than a stale inventory marker.
  for (const order of orders) reserved.add(order.itemId || order.item_id);
  return catalog.filter((card) => card.id && catalogStatus(card) === "inventory"
    && (!card.status || card.status === "inventory") && !reserved.has(card.id))
    .sort((a, b) => (cardEstimate(b) ?? -1) - (cardEstimate(a) ?? -1));
}

export function proposedListingPrice(card) {
  const estimate = card && cardEstimate(card);
  return estimate > 0 ? estimate.toFixed(2) : "";
}

export function listingPreparationIssue(card, price) {
  if (!card?.name?.trim()) return "Confirm the card's identity";
  if (!CONDITIONS.some((condition) => condition.v === card.condition)) return "Choose the condition you inspected";
  if (!Number.isFinite(Number(price)) || Number(Number(price).toFixed(2)) <= 0) return "Enter an asking price of at least $0.01";
  return null;
}

export function deriveSellerWorkflow({ catalog = [], listings = [], orders = [] } = {}) {
  const groups = { prepare: prepareListingCandidates(catalog, listings, orders), drafts: [], review: [], live: [], handoff: [], publishing: [], ship: [], awaitingPayment: [] };
  for (const listing of listings) {
    if (!listing.id) continue;
    const lifecycle = listingLifecycle(listing);
    if (lifecycle === "draft") groups.drafts.push(listing);
    else if (lifecycle === "needs_review") groups.review.push(listing);
    else if (groups[lifecycle]) groups[lifecycle].push(listing);
  }
  for (const order of orders) {
    if (!order.id) continue;
    const fulfillment = order.fulfillmentStatus || order.fulfillment_status || "pending";
    const payment = order.paymentStatus || order.payment_status;
    if (!OPEN_FULFILLMENT.has(fulfillment)) continue;
    if (payment === "paid") groups.ship.push(order);
    else if (payment === "awaiting_payment" || payment === "pending") groups.awaitingPayment.push(order);
  }
  groups.ship.sort((a, b) => String(a.soldAt || a.sold_at || "").localeCompare(String(b.soldAt || b.sold_at || "")));
  const nextGroup = ["ship", "review", "drafts", "prepare", "handoff", "publishing", "awaitingPayment", "live"].find((key) => groups[key].length) || "prepare";
  return { ...groups, nextGroup };
}

// Save only reviewed drafts. The caller retains ids across partial failures,
// including a response lost after the server committed an idempotent create.
async function persistReviewedListingDrafts({ selections, catalog, listings, orders = [], shipping, ids, persistIds = () => {}, shouldContinue = () => true, idFactory, useServer, itemsAPI, listingsAPI, onSaved, now = new Date().toISOString() }) {
  if (String(shipping).trim() === "" || !Number.isFinite(Number(shipping)) || Number(shipping) < 0) {
    throw new Error("Enter a shipping amount of zero or more");
  }
  const eligible = new Map(prepareListingCandidates(catalog, listings, orders).map((card) => [card.id, card]));
  const result = { saved: [], failed: [] };
  const seen = new Set();
  for (const selection of selections) {
    if (seen.has(selection.cardId)) continue;
    seen.add(selection.cardId);
    if (!shouldContinue()) { result.failed.push({ cardId: selection.cardId, error: "Draft preparation paused. Return to Prepare cards to resume." }); continue; }
    const source = eligible.get(selection.cardId);
    const card = source && { ...source, condition: selection.condition ?? source.condition };
    const issue = card ? listingPreparationIssue(card, selection.price) : "This card is no longer available for a new draft";
    if (issue) { result.failed.push({ cardId: selection.cardId, error: issue }); continue; }
    // An ended draft may be deliberately relisted; never reuse its terminal ID.
    if (listings.some((listing) => listing.id === ids.get(card.id) && listing.status === "ended")) ids.delete(card.id);
    if (!ids.has(card.id)) ids.set(card.id, idFactory());
    const listing = {
      id: ids.get(card.id), cardId: card.id, cardName: card.name, set: card.set, number: card.number,
      cardSet: card.set, cardNumber: card.number, platform: "ebay", format: "fixed",
      startPrice: Number(Number(selection.price).toFixed(2)), shipping: Number(Number(shipping).toFixed(2)),
      status: "draft", publishStatus: "draft", notes: "", createdAt: now,
      ...buildDraftContent(card),
    };
    try {
      await persistIds([...ids]);
      let savedListing = listing;
      if (useServer) {
        await itemsAPI.create(card);
        const response = await listingsAPI.create(listing);
        if (response?.id) savedListing = response;
      }
      await onSaved(savedListing, card);
      result.saved.push(savedListing);
    } catch (error) {
      result.failed.push({ cardId: card.id, error: error.message || "Draft could not be saved" });
    }
  }
  return result;
}
