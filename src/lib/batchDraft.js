import { CONDITIONS } from "./constants.js";
import { estimateSellingProceeds } from "./sellingEstimate.js";

export const SELLING_DEFAULTS = {
  buyerShipping: "0", shippingCost: "", packagingCost: "0", minProceeds: "0", storageLocation: "",
};
const text = (value) => String(value ?? "");
export function normalizeDraftCondition(value) {
  const aliases = { NM: "near_mint", MT: "mint", M: "mint", GM: "gem_mint", EX: "excellent", VG: "very_good", G: "good", FR: "fair", F: "fair", P: "poor" };
  return CONDITIONS.some((condition) => condition.v === value) ? value : aliases[text(value).toUpperCase()] || "";
}
export function conditionLabel(value) {
  // Raw-card condition is not a grading-service score.
  return (CONDITIONS.find((condition) => condition.v === value)?.l || "Not inspected").replace(/ \d+$/, "");
}
export function newDraftEntry({ id, card = {}, source = "photo", defaults = SELLING_DEFAULTS }) {
  return {
    id, itemId: card.id || id, listingId: `draft_${id}`, source,
    card: { ...card, name: text(card.name), set: text(card.set || card.cardSet || card.card_set), year: text(card.year),
      number: text(card.number || card.cardNumber || card.card_number), parallel: text(card.parallel),
      condition: normalizeDraftCondition(card.condition), type: card.type || "sports" },
    frontImgId: card.frontImgId || card.front_img_id || null, backImgId: card.backImgId || card.back_img_id || null,
    price: text(card.priceEstimate?.mid ?? card.marketPrice ?? ""),
    buyerShipping: defaults.buyerShipping, shippingCost: defaults.shippingCost, packagingCost: defaults.packagingCost,
    minProceeds: defaults.minProceeds, storageLocation: source === "inventory" ? card.storageLocation || "" : card.storageLocation || defaults.storageLocation,
    titleOverride: null, descriptionOverride: null, identityConfirmed: source === "inventory",
    conditionConfirmed: false, allowLowReturn: false, disposition: "sell", selected: false,
    stage: "review", error: null, createdAt: new Date().toISOString(),
  };
}
export function draftPreview(entry) {
  const card = entry.card;
  const title = [card.year, card.name, card.set, card.number && `#${card.number}`, card.parallel].filter(Boolean).join(" ");
  const description = [
    title, `Condition: ${conditionLabel(card.condition)} (seller inspected).`,
    "Please inspect the front and back photos for this exact card.", card.notes,
    "Ships from Canada. Review shipping service and handling details before publication.",
  ].filter(Boolean).join("\n\n");
  return { title: entry.titleOverride ?? title.slice(0, 80), description: entry.descriptionOverride ?? description };
}
const validMoney = (value, positive = false) => ["number", "string"].includes(typeof value) && text(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= (positive ? 0.01 : 0) && Number(value) <= 1000000;
export function draftReadiness(entry, feeRate) {
  const issues = [];
  if (!entry.card.name.trim()) issues.push("Add the card name");
  if (!entry.identityConfirmed) issues.push("Confirm the exact card and variant");
  if (!entry.frontImgId) issues.push("Add a front photo");
  if (!entry.backImgId) issues.push("Add a back photo");
  if (!entry.card.condition || !entry.conditionConfirmed) issues.push("Confirm the condition you inspected");
  if (!validMoney(entry.price, true)) issues.push("Enter a positive selling price");
  if (![entry.shippingCost, entry.buyerShipping, entry.packagingCost, entry.minProceeds].every((value) => validMoney(value))) issues.push("Complete the postage and proceeds assumptions");
  const preview = draftPreview(entry);
  if (!preview.title.trim() || preview.title.length > 80) issues.push("Use a title between 1 and 80 characters");
  if (!preview.description.trim() || preview.description.length > 10000) issues.push("Use a description between 1 and 10,000 characters");
  const proceeds = estimateSellingProceeds({ price: entry.price, feeRate, shippingCost: entry.shippingCost, buyerShipping: entry.buyerShipping, packagingCost: entry.packagingCost });
  const belowFloor = proceeds != null && validMoney(entry.minProceeds) && proceeds < Number(entry.minProceeds);
  const lot = entry.disposition === "lot" || (belowFloor && !entry.allowLowReturn);
  return { issues, proceeds, belowFloor, ready: entry.stage !== "saved" && !issues.length && !lot,
    bucket: entry.stage === "saved" ? "saved" : issues.length ? "review" : lot ? "lot" : "ready" };
}
export function inventoryBlockedReason(card, listings, entries = []) {
  if ([card.status, card.saleStatus, card.sale_status].some((value) => String(value).toLowerCase() === "sold")) return "Already sold";
  if (entries.some((entry) => entry.itemId === card.id)) return "Already in this batch";
  if (["listed", "active"].includes(card.status) || card.listedOn?.length) return "Already listed";
  if (listings.some((listing) => (listing.cardId || listing.card_id) === card.id && !["ended", "sold"].includes(listing.status))) return "Already has a draft or listing";
  return null;
}
export function applyDraftIdentification(entry, result) {
  if (!result?.name) return { ...entry, error: "Could not identify this card. Retry or enter its details.", stage: "review" };
  const card = { ...entry.card };
  for (const key of ["name", "set", "year", "number", "parallel", "rarity"]) {
    if (!card[key]) card[key] = text(result[key]); // Never clobber manual corrections.
  }
  return { ...entry, card: { ...card, priceEstimate: { ...result.priceEstimate, evidence: "ai_estimate_unverified", results: result.results || [] }, priceHistory: result.priceHistory || [] },
    price: entry.price || text(result.priceEstimate?.mid || ""),
    confidenceLabel: result.confidenceLabel || result.confidence || "low", stage: "review", error: null };
}
export function buildDraftPayload(entry, batchId) {
  const preview = draftPreview(entry);
  return {
    source: entry.source, batchId, expectedItemUpdatedAt: entry.source === "inventory" ? entry.card.updatedAt || null : null,
    item: { ...entry.card, id: entry.itemId, cardSet: entry.card.set, cardNumber: entry.card.number,
      frontImgId: entry.frontImgId, backImgId: entry.backImgId, storageLocation: entry.storageLocation,
      costBasis: Number(entry.card.costBasis) || 0, status: "inventory", listedOn: [],
      priceEstimate: { ...entry.card.priceEstimate, costBasisKnown: entry.card.costBasis != null && entry.card.costBasis !== "" },
    },
    draft: { id: entry.listingId, cardId: entry.itemId, cardName: entry.card.name, cardSet: entry.card.set, cardNumber: entry.card.number,
      listingTitle: preview.title, listingDescription: preview.description,
      platform: "ebay", format: "fixed", startPrice: Number(entry.price), shipping: Number(entry.buyerShipping),
      status: "draft", publishStatus: "draft", quantity: 1, exportBatchId: batchId,
      shippingProfile: { estimatedPostage: Number(entry.shippingCost), packagingCost: Number(entry.packagingCost), currency: "CAD" },
      notes: "Batch-reviewed draft only. Marketplace validation and publication have not run.",
    },
    identityConfirmed: entry.identityConfirmed, conditionConfirmed: entry.conditionConfirmed,
  };
}

// Normalize the two retired intake shapes without silently dropping unresolved work.
export function migrateDraftSession(saved, scan = [], tools = []) {
  if (saved && (saved.version !== 1 || !Array.isArray(saved.entries) || saved.entries.some((entry) => !entry?.id || !entry.itemId || !entry.card))) throw new Error("Saved selling batch is invalid; no data was changed");
  if (!Array.isArray(scan) || !Array.isArray(tools)) throw new Error("An older batch cannot be read; no data was changed");
  const session = saved || { version: 1, revision: 0, id: crypto.randomUUID(), defaults: { ...SELLING_DEFAULTS }, presets: [], entries: [] };
  const entries = [...session.entries];
  for (const [source, queue] of [["scan", scan], ["tools", tools]]) {
    for (const item of queue) {
      if (!item?.id) throw new Error("An older scan is missing its ID; no data was changed");
      const id = text(item.id);
      if (entries.some((entry) => entry.legacyKey === `${source}:${id}`)) continue;
      if (entries.some((entry) => entry.itemId === id)) throw new Error("Older batches contain conflicting card IDs; no data was changed");
      const result = source === "scan" ? item.result || {} : item;
      const entry = newDraftEntry({ id, card: { ...result, id, priceEstimate: result.priceEstimate }, defaults: session.defaults });
      entries.push({ ...entry, legacyKey: `${source}:${id}`, id: `${source}:${id}`, itemId: id,
        frontImgId: (item.front || item.frontImg) ? `img_${id}_front` : entry.frontImgId,
        backImgId: (item.back || item.backImg) ? `img_${id}_back` : entry.backImgId,
        confidenceLabel: result.confidenceLabel || result.confidence || null, error: item.error || null,
      });
    }
  }
  return { ...session, entries, revision: session.revision + 1 };
}
