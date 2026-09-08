// Seller-assessed raw-card condition. These labels never imply a professional grade.
const CONDITIONS = {
  gem_mint: ["Near Mint or Better", "400010"], mint: ["Near Mint or Better", "400010"], near_mint: ["Near Mint or Better", "400010"],
  excellent: ["Excellent", "400011"], very_good: ["Very Good", "400012"], good: ["Poor", "400013"], fair: ["Poor", "400013"], poor: ["Poor", "400013"],
};
const ALIASES = { gm: "gem_mint", mt: "mint", m: "mint", nm: "near_mint", ex: "excellent", vg: "very_good", g: "good", fr: "fair", f: "fair", p: "poor" };
export function ungradedCardCondition(value) {
  const key = String(value || "").trim().toLowerCase();
  const normalized = ALIASES[key] || key;
  const entry = CONDITIONS[normalized];
  return entry ? { value: normalized, label: entry[0], descriptor: entry[1] } : null;
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
export function buildDraftContent(card = {}) {
  const name = clean(card.playerName || card.player_name || card.name);
  const set = clean(card.cardSet || card.card_set || card.set);
  const number = clean(card.cardNumber ?? card.card_number ?? card.number);
  const condition = ungradedCardCondition(card.condition);
  const parts = [card.year, set, name, number && `#${number}`, card.parallel].map(clean).filter(Boolean);
  const listingTitle = [...new Set(parts)].join(" ").slice(0, 80);
  const listingDescription = [
    name,
    card.year && `Year: ${clean(card.year)}`,
    set && `Set: ${set}`,
    number && `Card number: ${number}`,
    card.parallel && `Parallel: ${clean(card.parallel)}`,
    condition && `Ungraded. Seller-assessed condition: ${condition.label}.`,
    "Please review the photos for the card's condition.",
  ].filter(Boolean).join("\n");
  return { listingTitle, listingDescription };
}

export function draftReviewValues(listing, card = {}) {
  const defaults = buildDraftContent(card);
  const title = listing.listingTitle ?? listing.listing_title;
  const description = listing.listingDescription ?? listing.listing_description;
  return {
    listingTitle: clean(title) ? title : defaults.listingTitle,
    listingDescription: clean(description) ? description : defaults.listingDescription,
    startPrice: String(listing.startPrice ?? listing.start_price ?? ""),
    shipping: String(listing.shipping ?? ""),
    condition: ungradedCardCondition(card.condition)?.value || "",
  };
}

export function changeDraftReviewField(form, field, value) {
  const next = { ...form, [field]: value };
  if (field === "condition") {
    const oldCondition = ungradedCardCondition(form.condition);
    const newCondition = ungradedCardCondition(value);
    if (oldCondition && newCondition) {
      const oldLine = `Ungraded. Seller-assessed condition: ${oldCondition.label}.`;
      const newLine = `Ungraded. Seller-assessed condition: ${newCondition.label}.`;
      next.listingDescription = form.listingDescription.split("\n").map((line) => line === oldLine ? newLine : line).join("\n");
    }
  }
  return next;
}

export function draftContentIssues(listing, card = {}) {
  const title = String(listing.listingTitle ?? listing.listing_title ?? "").trim();
  const description = String(listing.listingDescription ?? listing.listing_description ?? "").trim();
  const price = listing.startPrice ?? listing.start_price;
  const shipping = listing.shipping;
  const issues = [];
  if (!clean(card.name || card.playerName || card.player_name)) issues.push("Identify the card before publishing.");
  if (!title || title.length > 80) issues.push("Enter a listing title of 1–80 characters.");
  if (!description) issues.push("Add a description for the buyer.");
  if (!ungradedCardCondition(card.condition)) issues.push("Choose the condition you inspected.");
  if (!Number.isFinite(Number(price)) || Number(Number(price).toFixed(2)) < 0.01) issues.push("Enter an asking price of at least $0.01.");
  if (shipping == null || String(shipping).trim() === "" || !Number.isFinite(Number(shipping)) || Number(shipping) < 0) issues.push("Enter a shipping amount of zero or more.");
  return issues;
}
