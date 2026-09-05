import { matchScore } from "./search/globalSearch.js";

function amount(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function cardEstimate(card) {
  return amount(card.priceEstimate?.mid);
}

export function catalogStatus(card) {
  if (card.status === "sold") return "sold";
  if (card.status === "listed" || card.listingStatus === "listed" ||
      (Array.isArray(card.listedOn) && card.listedOn.length > 0)) return "listed";
  return "inventory";
}

export function catalogReturnFocusId(cards, origin) {
  if (!origin || cards.length === 0) return null;
  if (cards.some((card) => card.id === origin.id)) return origin.id;
  // A sold/deleted card may no longer match the current filter. Continue
  // at its previous position, or the preceding card if it was last.
  const index = Number.isInteger(origin.index) ? origin.index : 0;
  return cards[Math.min(Math.max(index, 0), cards.length - 1)].id;
}

export function summarizeCatalog(catalog) {
  const summary = { owned: 0, listed: 0, sold: 0, priced: 0, value: 0, gain: 0, comparable: 0 };
  for (const card of catalog) {
    const status = catalogStatus(card);
    if (status === "sold") {
      summary.sold += 1;
      continue;
    }
    summary.owned += 1;
    if (status === "listed") summary.listed += 1;
    const value = cardEstimate(card);
    if (value === null) continue;
    summary.priced += 1;
    summary.value += value;
    const cost = amount(card.costBasis);
    if (cost !== null) {
      summary.comparable += 1;
      summary.gain += value - cost;
    }
  }
  return summary;
}

// Unknown values/dates stay at the end in either sort direction.
function compareOptional(a, b, direction) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function timestamp(card) {
  const parsed = Date.parse(card.createdAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function filterCatalog(catalog, { binder = "", status = "all", search = "", sort = "date_desc" } = {}) {
  const filtered = catalog.filter((card) => {
    const state = catalogStatus(card);
    if (binder && card.binder !== binder) return false;
    if (status === "owned" && state === "sold") return false;
    if ((status === "listed" || status === "sold") && state !== status) return false;
    return !search.trim() || matchScore(card, search) > 0;
  });
  const sorters = {
    date_desc: (a, b) => compareOptional(timestamp(a), timestamp(b), -1),
    date_asc: (a, b) => compareOptional(timestamp(a), timestamp(b), 1),
    value_desc: (a, b) => compareOptional(cardEstimate(a), cardEstimate(b), -1),
    value_asc: (a, b) => compareOptional(cardEstimate(a), cardEstimate(b), 1),
    name_asc: (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" }),
  };
  return filtered.sort(sorters[sort] || sorters.date_desc);
}
