/**
 * Build marketplace item specifics from item data.
 * @param {object} item
 * @returns {object}
 */
export function buildItemSpecifics(item) {
  return {
    Year: item.year || "",
    Manufacturer: item.manufacturer || "",
    Set: item.card_set || "",
    Player: item.player_name || item.name || "",
    Team: item.team || "",
    "Card Number": item.card_number || "",
    Parallel: item.parallel || "",
    Rookie: item.is_rookie || /rookie/i.test(item.rarity || "") ? "Yes" : "No",
    Autograph: item.has_autograph ? "Yes" : "No",
    Memorabilia: item.is_memorabilia ? "Yes" : "No",
    Condition: item.condition || "",
  };
}
