export function buildListingTitle(item) {
  const parts = [
    item.year,
    item.card_set,
    item.player_name || item.name,
    item.card_number ? `#${item.card_number}` : null,
    item.parallel,
    item.condition,
    item.team,
    item.is_rookie || /rookie/i.test(item.rarity || "") ? "Rookie" : null,
    item.has_autograph ? "Auto" : null,
  ]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter((part, index, list) => list.indexOf(part) === index);

  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 80);
}
