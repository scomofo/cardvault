// Display + item-patch helpers for identification candidates. Candidate cards
// are raw catalog_cards rows (player_name/set_name/card_number) or external
// visual-search cards with the same snake_case shape; tolerate camelCase too.

export function describeCatalogCard(card) {
  if (!card) return null;
  const name = card.player_name || card.playerName || card.name || "";
  const set = card.set_name || card.setName || card.set || card.card_set || "";
  const number = card.card_number || card.cardNumber || card.number || "";
  const year = card.year || "";
  const label = [
    name,
    [year, set].filter(Boolean).join(" "),
    number && `#${number}`,
  ]
    .filter(Boolean)
    .join(" — ");
  return { name, set, number, year, label };
}

// Fields to apply onto a client catalog item when the user corrects the
// identification. Only non-empty values — a correction must never blank
// data the user already entered.
export function catalogCardToItemPatch(card) {
  const described = describeCatalogCard(card);
  if (!described) return {};
  const patch = {};
  if (described.name) patch.name = described.name;
  if (described.set) patch.set = described.set;
  if (described.number) patch.number = described.number;
  if (described.year) patch.year = String(described.year);
  const parallel = card.parallel_name || card.parallelName || card.parallel || "";
  if (parallel) patch.parallel = parallel;
  const rarity = card.rarity || "";
  if (rarity) patch.rarity = rarity;
  return patch;
}
